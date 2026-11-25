import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { markSignedOut } from "@/lib/jaceDevice";

/** Sign out of the current account (it stays in the account list). No automatic sign-in after this. */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  await markSignedOut(true);
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
