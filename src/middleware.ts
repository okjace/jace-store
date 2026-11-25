import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// (same names as lib/jaceDevice.ts; middleware can't import Node-only code)
const SIGNED_OUT_COOKIE = "jace_signed_out";
const TRIED_COOKIE = "jace_auto_tried";
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|lighthouse|headless|curl|wget|python|node-fetch|axios/i;

/**
 * Automatic sign-in with Jace: a signed-out person opening a page in their browser is sent through
 * Jace once (prompt=none). Signed in to Jace, they come straight back signed in; otherwise they come
 * back signed out and see "Sign in" as usual. Tried at most once an hour, never for crawlers or
 * background requests, and never after signing out of Jace Store on purpose.
 */
function shouldTrySilentSignIn(request: NextRequest) {
  if (request.method !== "GET" || !process.env.JACE_CLIENT_ID) return false;
  if (request.cookies.get(TRIED_COOKIE) || request.cookies.get(SIGNED_OUT_COOKIE)) return false;
  const h = request.headers;
  // only real page loads: not client-side navigations, prefetches or API calls
  if (h.get("sec-fetch-dest") !== "document" || h.get("sec-fetch-mode") !== "navigate") return false;
  if (h.get("rsc") || h.get("next-router-prefetch") || h.get("purpose") === "prefetch" || h.get("sec-purpose")?.includes("prefetch")) return false;
  if (BOT.test(h.get("user-agent") ?? "")) return false;
  const path = request.nextUrl.pathname;
  return !path.startsWith("/api/") && !path.startsWith("/auth/") && !path.startsWith("/login");
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );
  // Refreshes the auth token if expired.
  const { data: { user } } = await supabase.auth.getUser();

  if (!user && shouldTrySilentSignIn(request)) {
    const start = new URL("/api/auth/jace/start", request.url);
    start.searchParams.set("silent", "1");
    start.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    const redirect = NextResponse.redirect(start);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    redirect.cookies.set(TRIED_COOKIE, "1", {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: 3600, secure: process.env.NODE_ENV === "production",
    });
    return redirect;
  }
  return response;
}

export const config = {
  // Skip static assets and the public launcher API (no session needed there).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/v2|api/launcher|api/desktop|api/download|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
