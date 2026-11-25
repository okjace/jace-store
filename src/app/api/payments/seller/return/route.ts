import { NextResponse } from "next/server";
import { optionalApiUser } from "@/lib/apiAuth";
import { siteUrl } from "@/lib/constants";
import { refreshSeller } from "@/lib/payments";

/** Back from Stripe's sign-up: note whether the account can take payments now. */
export async function GET(req: Request) {
  const userId = await optionalApiUser(req);
  if (userId) await refreshSeller(userId).catch(() => null);
  return NextResponse.redirect(`${siteUrl()}/settings#selling`, 303);
}
