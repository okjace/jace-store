import { handler, requireApiUser } from "@/lib/apiAuth";
import { siteUrl } from "@/lib/constants";
import { customerFor, stripe } from "@/lib/payments";

/** POST: Stripe's billing page (subscriptions, receipts, payment methods). */
export const POST = handler(async (req) => {
  const userId = await requireApiUser(req);
  const s = await stripe().billingPortal.sessions.create({ customer: await customerFor(userId), return_url: `${siteUrl()}/settings#payments` });
  return { url: s.url };
});
