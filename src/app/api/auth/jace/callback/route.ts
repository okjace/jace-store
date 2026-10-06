import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { JACE, jaceRedirectUri, normalizeUserinfo, STATE_COOKIE } from "@/lib/jaceOAuth";

/**
 * Finish "Sign in with Jace":
 *  1. verify state, exchange the code, fetch userinfo
 *  2. find-or-create a Supabase user keyed by the Jace account id
 *  3. mint a one-time login token for that user and redeem it, which sets the
 *     normal Supabase session cookies.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const fail = (msg: string) => {
    const res = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, request.url));
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth/jace" });
    return res;
  };

  if (url.searchParams.get("error")) {
    return fail(url.searchParams.get("error_description") || "Jace sign-in was cancelled");
  }

  const cookieStore = await cookies();
  let saved: { state?: string; next?: string } = {};
  try {
    saved = JSON.parse(cookieStore.get(STATE_COOKIE)?.value ?? "{}");
  } catch {}
  const code = url.searchParams.get("code");
  if (!code || !saved.state || saved.state !== url.searchParams.get("state")) {
    return fail("Jace sign-in expired or was tampered with. Please try again.");
  }

  // 1. Code -> access token -> userinfo
  const tokenRes = await fetch(JACE.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: jaceRedirectUri(),
      client_id: process.env.JACE_CLIENT_ID ?? "",
      client_secret: process.env.JACE_CLIENT_SECRET ?? "",
    }),
    cache: "no-store",
  });
  const token = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !token.access_token) {
    return fail(token.error_description || token.error || "Couldn't get a token from Jace");
  }

  const infoRes = await fetch(JACE.userinfo, {
    headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/json" },
    cache: "no-store",
  });
  const jace = normalizeUserinfo(await infoRes.json().catch(() => ({})));
  if (!infoRes.ok || !jace) return fail("Couldn't read your Jace profile");

  // 2. Find or create the matching Supabase user. The login email is derived from
  // the Jace id (not the user's real email) so a Jace account can never take over
  // an existing email/GitHub account. No mail is ever sent to this address.
  const safeId = jace.id.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const loginEmail = `jace-${safeId}@users.jaceo.vercel.app`;
  const admin = createAdminClient();
  const metadata = {
    provider: "jace",
    jace_id: jace.id,
    username: jace.username ?? undefined,
    full_name: jace.name ?? jace.username ?? undefined,
    avatar_url: jace.avatarUrl ?? undefined,
    contact_email: jace.email ?? undefined,
  };
  const created = await admin.auth.admin.createUser({
    email: loginEmail,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (created.error && !/already/i.test(created.error.message)) {
    return fail(`Couldn't create your account: ${created.error.message}`);
  }

  // 3. One-time token -> real session cookies.
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: loginEmail });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) return fail("Couldn't start your session");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash });
  if (error) return fail(error.message);

  const next = saved.next && saved.next.startsWith("/") && !saved.next.startsWith("//") ? saved.next : "/dashboard";
  const res = NextResponse.redirect(new URL(next, request.url));
  res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth/jace" });
  return res;
}
