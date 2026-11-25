/** Signing in to Jace Store as a Jace account (the callback and the account switcher share this). */
import { currentState } from "./accountModeration";
import { jaceStoreUserFor } from "./jaceAccounts";
import { forgetAccount, markSignedOut, rememberAccount, type JaceToken } from "./jaceDevice";
import { JACE, normalizeUserinfo, type JaceUser } from "./jaceOAuth";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

export type Userinfo =
  | { status: "ok"; jace: JaceUser }
  | { status: "unauthorized" }                 // token expired or revoked: sign that account in again
  | { status: "banned" }                       // banned on Jace
  | { status: "error"; message: string };

export async function fetchUserinfo(accessToken: string): Promise<Userinfo> {
  const r = await fetch(JACE.userinfo, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, cache: "no-store" })
    .catch(() => null);
  if (!r) return { status: "error", message: "Jace didn't answer" };
  const body = await r.json().catch(() => ({}));
  if (r.status === 401) return { status: "unauthorized" };
  if (r.status === 403 || body?.banned === true || body?.error === "account_banned") return { status: "banned" };
  const jace = r.ok ? normalizeUserinfo(body) : null;
  return jace ? { status: "ok", jace } : { status: "error", message: "Couldn't read the Jace profile" };
}

/** Start a Supabase session for this Jace Store account (one-time login token, redeemed at once). */
async function startSession(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: target } = await admin.auth.admin.getUserById(userId);
  const email = target.user?.email;
  if (!email) return "This account has no email to sign in with";
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) return "Couldn't start your session";
  const { error } = await (await createClient()).auth.verifyOtp({ type: "email", token_hash: tokenHash });
  return error ? error.message : null;
}

/** Sign in as this Jace account (making its Jace Store account if needed) and remember it on this device. */
export async function signInWithJace(jace: JaceUser, token: JaceToken): Promise<{ userId: string } | { error: string }> {
  const userId = await jaceStoreUserFor(jace);
  if (!userId) return { error: "Couldn't create your account" };
  const err = await startSession(userId);
  if (err) return { error: err };
  await currentState(userId, true).catch(() => null);          // bring over a Jace ban / mute right away
  const { data: profile } = await createAdminClient().from("profiles").select("display_name").eq("id", userId).maybeSingle();
  await rememberAccount({
    jace_id: jace.id, user_id: userId, username: jace.username,
    display_name: jace.name || profile?.display_name || null, picture: jace.avatarUrl,
  }, token);
  await markSignedOut(false);
  return { userId };
}

/** Banned on Jace: forget it here too. */
export async function dropBanned(jaceId: string) {
  await forgetAccount(jaceId);
}
