import { ApiError, handler, readJson } from "@/lib/apiAuth";
import { currentState, restriction } from "@/lib/accountModeration";
import { jaceStoreUserFor } from "@/lib/jaceAccounts";
import { JACE, normalizeUserinfo } from "@/lib/jaceOAuth";
import { JACE_URL } from "@/lib/jace";
import { issueDesktopToken } from "@/lib/desktopSession";

export const dynamic = "force-dynamic";

/**
 * POST { access_token } — sign the desktop app in with a Jace access token it got from the computer
 * (Jace OS: `jace-account --token-for <Jace Store's client_id>`). The token must be active and issued
 * to Jace Store's own Jace app (checked with Jace's /api/oauth/introspect); then this signs in to the
 * same Jace Store account "Sign in with Jace" would, and returns the desktop app's session token.
 * -> { token, user: { username, display_name, avatar_url } }
 * Tokens are never logged.
 */
export const POST = handler(async (req) => {
  const { access_token } = await readJson<{ access_token?: string }>(req);
  if (!access_token || typeof access_token !== "string" || access_token.length > 4096) throw new ApiError(400, "access_token is required");
  const id = process.env.JACE_CLIENT_ID, secret = process.env.JACE_CLIENT_SECRET;
  if (!id || !secret) throw new ApiError(503, "Jace sign-in isn't set up on this server");

  // 1. Is it a live token Jace issued to *our* app?
  const intro = await fetch(`${JACE_URL}/api/oauth/introspect`, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(8000),
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` },
    body: new URLSearchParams({ token: access_token }),
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { active?: boolean; client_id?: string; sub?: string } | null;
  if (!intro?.active || intro.client_id !== id || !intro.sub) throw new ApiError(401, "That Jace token isn't valid for Jace Store");

  // 2. Who is it? (the same userinfo the browser sign-in reads)
  const info = await fetch(JACE.userinfo, {
    cache: "no-store", signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${access_token}`, Accept: "application/json" },
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const jace = info && normalizeUserinfo(info);
  if (!jace || jace.id !== intro.sub) throw new ApiError(401, "Couldn't read that Jace account");

  // 3. The Jace Store account it signs in to, with Jace's ban / mute brought over first
  const userId = await jaceStoreUserFor(jace);
  if (!userId) throw new ApiError(500, "Couldn't create your account");
  const r = restriction(await currentState(userId, true).catch(() => null));
  if (r?.kind === "banned") throw new ApiError(403, r.message);
  return await issueDesktopToken(userId, "jace-os");
});
