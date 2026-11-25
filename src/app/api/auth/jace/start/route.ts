import { NextResponse } from "next/server";
import { JACE, jaceRedirectUri, STATE_COOKIE } from "@/lib/jaceOAuth";

export async function GET(request: Request) {
  const clientId = process.env.JACE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(new URL("/login?error=Jace+sign-in+is+not+configured", request.url));
  }
  const params = new URL(request.url).searchParams;
  // mode=link: attach Jace to the signed-in account instead of signing in.
  const mode = params.get("mode") === "link" ? "link" : "signin";
  const nextParam = params.get("next") ?? (mode === "link" ? "/settings" : "/dashboard");
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";
  const state = crypto.randomUUID();
  const silent = params.get("silent") === "1" && mode === "signin";
  const add = params.get("add") === "1";

  const url = new URL(JACE.authorize);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: jaceRedirectUri(),
    scope: "profile email",
    state,
    // silent=1: sign in with no clicks if already signed in to Jace (Jace answers login_required /
    // consent_required otherwise). add=1: let the person pick or add a different Jace account.
    ...(silent ? { prompt: "none" } : add ? { prompt: "select_account" } : {}),
  }).toString();

  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, JSON.stringify({ state, next, mode, silent }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/jace",
    maxAge: 600,
  });
  return res;
}
