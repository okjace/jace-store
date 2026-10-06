import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { JACE, jaceLoginEmail, jaceRedirectUri, normalizeUserinfo, STATE_COOKIE, type JaceUser } from "@/lib/jaceOAuth";

/**
 * Finish "Sign in with Jace" (or "Link Jace" from account settings):
 *  1. verify state, exchange the code, fetch userinfo
 *  2a. link mode: attach the Jace id to the signed-in account
 *  2b. sign-in mode: find the account linked to this Jace id (or create one),
 *      mint a one-time login token for it and redeem it, which sets the normal
 *      Supabase session cookies.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const cookieStore = await cookies();
  let saved: { state?: string; next?: string; mode?: string } = {};
  try {
    saved = JSON.parse(cookieStore.get(STATE_COOKIE)?.value ?? "{}");
  } catch {}
  const linking = saved.mode === "link";
  const safeNext = (n: string | undefined, fallback: string) => (n && n.startsWith("/") && !n.startsWith("//") ? n : fallback);

  const finish = (path: string) => {
    const res = NextResponse.redirect(new URL(path, request.url));
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth/jace" });
    return res;
  };
  const fail = (msg: string) =>
    finish(linking ? `/settings?error=${encodeURIComponent(msg)}#sign-in` : `/login?error=${encodeURIComponent(msg)}`);

  if (url.searchParams.get("error")) {
    return fail(url.searchParams.get("error_description") || "Jace sign-in was cancelled");
  }
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

  const admin = createAdminClient();
  const supabase = await createClient();
  const { data: existing } = await admin.from("jace_links").select("user_id").eq("jace_id", jace.id).maybeSingle();

  // 2a. Link Jace to the account that's signed in right now.
  if (linking) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return finish(`/login?error=${encodeURIComponent("Sign in first, then link Jace from Account settings")}`);
    if (existing && existing.user_id !== user.id) {
      return fail("That Jace account is already linked to a different Jace Store account. Unlink it there first.");
    }
    const { error } = await admin
      .from("jace_links")
      .upsert({ jace_id: jace.id, user_id: user.id, jace_username: jace.username }, { onConflict: "user_id" });
    if (error) return fail(error.message.includes("duplicate") ? "Your account already has a Jace account linked." : error.message);
    return finish(safeNext(saved.next, "/settings") + "?linked=jace#sign-in");
  }

  // 2b. Sign in.
  const userId = existing?.user_id ?? (await createJaceUser(admin, jace));
  if (!userId) return fail("Couldn't create your account");
  const { data: target } = await admin.auth.admin.getUserById(userId);
  const email = target.user?.email;
  if (!email) return fail("This account has no email to sign in with");

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) return fail("Couldn't start your session");
  const { error } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash });
  if (error) return fail(error.message);

  return finish(safeNext(saved.next, "/dashboard"));
}

/**
 * New Jace user: create a store account with a placeholder login email derived
 * from the Jace id (never the real email), so a Jace login can't take over an
 * existing email/GitHub account. No mail is ever sent to this address.
 */
async function createJaceUser(admin: ReturnType<typeof createAdminClient>, jace: JaceUser) {
  const loginEmail = jaceLoginEmail(jace.id);
  let userId: string | undefined;
  const created = await admin.auth.admin.createUser({
    email: loginEmail,
    email_confirm: true,
    user_metadata: {
      provider: "jace",
      jace_id: jace.id,
      username: jace.username ?? undefined,
      full_name: jace.name ?? jace.username ?? undefined,
      avatar_url: jace.avatarUrl ?? undefined,
      contact_email: jace.email ?? undefined,
    },
  });
  if (created.data.user) {
    userId = created.data.user.id;
  } else if (/already/i.test(created.error?.message ?? "")) {
    // Placeholder account exists but its link row is missing: find it.
    for (let page = 1; page <= 50 && !userId; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      userId = data.users.find((u) => u.email === loginEmail)?.id;
      if (data.users.length < 200) break;
    }
  }
  if (!userId) return null;
  await admin.from("jace_links").upsert({ jace_id: jace.id, user_id: userId, jace_username: jace.username }, { onConflict: "jace_id" });
  return userId;
}
