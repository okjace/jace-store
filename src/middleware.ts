import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
  await supabase.auth.getUser();
  return response;
}

export const config = {
  // Skip static assets and the public launcher API (no session needed there).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/v2|api/download|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
