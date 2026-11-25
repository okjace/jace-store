import { currentState } from "@/lib/accountModeration";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { JACE, jaceRedirectUri, STATE_COOKIE } from "@/lib/jaceOAuth";
import { fetchUserinfo, signInWithJace } from "@/lib/jaceSignIn";
import { tokenFrom } from "@/lib/jaceDevice";

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
  let saved: { state?: string; next?: string; mode?: string; silent?: boolean } = {};
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

  // Silent sign-in (prompt=none) that Jace couldn't do: not signed in to Jace (login_required) or
  // automatic sign-in turned off for Jace Store (consent_required). Carry on signed out, no message;
  // the "tried" cookie stops it from trying again for a while.
  if (saved.silent && !url.searchParams.get("code")) return finish(safeNext(saved.next, "/"));
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
    return saved.silent ? finish(safeNext(saved.next, "/")) : fail(token.error_description || token.error || "Couldn't get a token from Jace");
  }
  const info = await fetchUserinfo(token.access_token);
  if (info.status === "banned") return fail("That Jace account is banned, so it can't sign in to Jace Store.");
  if (info.status !== "ok") return saved.silent ? finish(safeNext(saved.next, "/")) : fail("Couldn't read your Jace profile");
  const jace = info.jace;

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
    await currentState(user.id, true).catch(() => null);      // bring over a Jace ban / mute right away
    return finish(safeNext(saved.next, "/settings") + "?linked=jace#sign-in");
  }

  // 2b. Sign in (also: added another account, or signed an account in again), and remember it on this device.
  const done = await signInWithJace(jace, tokenFrom(token));
  if ("error" in done) return fail(done.error);
  return finish(safeNext(saved.next, "/dashboard"));
}
