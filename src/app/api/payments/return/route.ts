import { NextResponse } from "next/server";
import { siteUrl } from "@/lib/constants";
import { recordCheckout } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";

/** Back from Stripe's checkout: record the purchase right away (the webhook does it too) and show the project. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("session_id") ?? "";
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return NextResponse.redirect(siteUrl(), 303);
  const got = await recordCheckout(id).catch(() => null);
  if (!got) return NextResponse.redirect(`${siteUrl()}/settings#payments`, 303);
  const { data } = await createAdminClient().from("projects").select("slug").eq("id", got.projectId).maybeSingle();
  return NextResponse.redirect(`${siteUrl()}/project/${data?.slug ?? ""}?bought=1`, 303);
}
