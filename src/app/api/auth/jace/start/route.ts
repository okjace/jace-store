import { NextResponse } from "next/server";
import { JACE, jaceRedirectUri, STATE_COOKIE } from "@/lib/jaceOAuth";

export async function GET(request: Request) {
  const clientId = process.env.JACE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(new URL("/login?error=Jace+sign-in+is+not+configured", request.url));
  }
  const nextParam = new URL(request.url).searchParams.get("next") ?? "/dashboard";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";
  const state = crypto.randomUUID();

  const url = new URL(JACE.authorize);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: jaceRedirectUri(),
    scope: "profile email",
    state,
  }).toString();

  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, JSON.stringify({ state, next }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/jace",
    maxAge: 600,
  });
  return res;
}
