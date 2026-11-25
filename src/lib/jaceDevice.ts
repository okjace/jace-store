/**
 * The Jace accounts that signed in to Jace Store on this device (the account switcher, migration 015).
 *
 * A device is a random secret in an httpOnly cookie. Each account's row holds its Jace profile and
 * its Jace token, encrypted (AES-256-GCM) with a key made from the device secret and the server's
 * secret: the browser only ever has the cookie, and the database alone can't read the tokens.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "./supabase/admin";
import { JACE } from "./jaceOAuth";

export const DEVICE_COOKIE = "jace_device";
/** Set after signing out on purpose: no automatic sign-in until the next real sign-in. */
export const SIGNED_OUT_COOKIE = "jace_signed_out";
/** Set when a silent sign-in was tried: don't try again for a while (no redirect loops). */
export const TRIED_COOKIE = "jace_auto_tried";

const secure = process.env.NODE_ENV === "production";
const YEAR = 365 * 24 * 3600;

export interface JaceToken { access_token: string; refresh_token?: string | null; expires_at?: number | null }
export interface DeviceAccount {
  jace_id: string; user_id: string; username: string | null; display_name: string | null; picture: string | null; last_used_at: string;
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const keyFor = (device: string) => createHash("sha256").update(`jace-store-accounts:${device}:${process.env.JACE_CLIENT_SECRET ?? ""}`).digest();

function encrypt(device: string, value: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyFor(device), iv);
  const body = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url");
}

function decrypt<T>(device: string, data: string): T | null {
  try {
    const raw = Buffer.from(data, "base64url");
    const d = createDecipheriv("aes-256-gcm", keyFor(device), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** This device's secret (made when `create`). Only usable in route handlers / server actions when creating. */
async function device(create = false): Promise<string | null> {
  const jar = await cookies();
  const have = jar.get(DEVICE_COOKIE)?.value;
  if (have && /^[A-Za-z0-9_-]{43}$/.test(have)) return have;
  if (!create) return null;
  const fresh = randomBytes(32).toString("base64url");
  jar.set(DEVICE_COOKIE, fresh, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: YEAR });
  return fresh;
}

/** Remember (or refresh) an account on this device. */
export async function rememberAccount(a: { jace_id: string; user_id: string; username: string | null; display_name: string | null; picture: string | null }, token: JaceToken) {
  const dev = await device(true);
  if (!dev) return;
  await createAdminClient().from("jace_device_accounts").upsert({
    device_hash: hash(dev), ...a, token_enc: encrypt(dev, token), last_used_at: new Date().toISOString(),
  }, { onConflict: "device_hash,jace_id" }).then(() => {}, () => {});        // before migration 015: just not remembered
}

export async function listAccounts(): Promise<DeviceAccount[]> {
  const dev = await device();
  if (!dev) return [];
  const { data } = await createAdminClient().from("jace_device_accounts")
    .select("jace_id, user_id, username, display_name, picture, last_used_at")
    .eq("device_hash", hash(dev)).order("last_used_at", { ascending: false });
  return (data ?? []) as DeviceAccount[];
}

export async function accountToken(jaceId: string): Promise<(DeviceAccount & { token: JaceToken | null }) | null> {
  const dev = await device();
  if (!dev) return null;
  const { data } = await createAdminClient().from("jace_device_accounts").select("*").eq("device_hash", hash(dev)).eq("jace_id", jaceId).maybeSingle();
  return data ? { ...(data as DeviceAccount), token: decrypt<JaceToken>(dev, data.token_enc) } : null;
}

export async function saveToken(jaceId: string, token: JaceToken) {
  const dev = await device();
  if (!dev) return;
  await createAdminClient().from("jace_device_accounts").update({ token_enc: encrypt(dev, token), last_used_at: new Date().toISOString() })
    .eq("device_hash", hash(dev)).eq("jace_id", jaceId);
}

export async function forgetAccount(jaceId: string) {
  const dev = await device();
  if (dev) await createAdminClient().from("jace_device_accounts").delete().eq("device_hash", hash(dev)).eq("jace_id", jaceId);
}

/** "Sign out of all": forget every account and the device itself. */
export async function forgetDevice() {
  const dev = await device();
  if (dev) await createAdminClient().from("jace_device_accounts").delete().eq("device_hash", hash(dev));
  (await cookies()).delete(DEVICE_COOKIE);
}

export async function markSignedOut(on: boolean) {
  const jar = await cookies();
  if (on) jar.set(SIGNED_OUT_COOKIE, "1", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: YEAR });
  else jar.delete(SIGNED_OUT_COOKIE);
}

/** Token response from Jace -> what we keep. */
export function tokenFrom(t: Record<string, unknown>): JaceToken {
  const expires = Number(t.expires_in);
  return {
    access_token: String(t.access_token),
    refresh_token: typeof t.refresh_token === "string" ? t.refresh_token : null,
    expires_at: expires > 0 ? Math.floor(Date.now() / 1000) + expires : null,
  };
}

/** A fresh access token from a refresh token, if Jace gives refresh tokens. */
export async function refreshJaceToken(t: JaceToken): Promise<JaceToken | null> {
  if (!t.refresh_token) return null;
  const r = await fetch(JACE.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token", refresh_token: t.refresh_token,
      client_id: process.env.JACE_CLIENT_ID ?? "", client_secret: process.env.JACE_CLIENT_SECRET ?? "",
    }),
    cache: "no-store",
  }).catch(() => null);
  const j = r?.ok ? await r.json().catch(() => null) : null;
  return j?.access_token ? { ...tokenFrom(j), refresh_token: j.refresh_token ?? t.refresh_token } : null;
}
