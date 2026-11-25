import { NextResponse } from "next/server";
import { handler, requireApiUser } from "@/lib/apiAuth";
import { onboardingUrl, paymentsReady, refreshSeller } from "@/lib/payments";
import { siteUrl } from "@/lib/constants";

/** GET: is my Stripe account connected and able to take payments? (?go=1: continue Stripe's sign-up.) */
export const GET = handler(async (req) => {
  const userId = await requireApiUser(req);
  if (new URL(req.url).searchParams.get("go")) return NextResponse.redirect(await onboardingUrl(userId), 303);
  if (!paymentsReady()) return { available: false };
  const link = await refreshSeller(userId).catch(() => null);
  return { available: true, connected: !!link?.account_id, ready: !!link?.charges_enabled, payouts: !!link?.payouts_enabled };
});

/** POST: a Stripe page to connect (or finish connecting) my account, so I can sell. */
export const POST = handler(async (req) => {
  const userId = await requireApiUser(req);
  return { url: await onboardingUrl(userId), return_to: `${siteUrl()}/settings#selling` };
});
