import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/dashboard";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";
  const providerError = searchParams.get("error_description") || searchParams.get("error");
  if (providerError) {
    // e.g. linking a GitHub account that already belongs to another user
    const back = next.startsWith("/settings") ? "/settings" : "/login";
    return NextResponse.redirect(`${origin}${back}?error=${encodeURIComponent(providerError)}${back === "/settings" ? "#sign-in" : ""}`);
  }
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }
  return NextResponse.redirect(`${origin}/login?error=Missing+auth+code`);
}
