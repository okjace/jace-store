import { ApiError, handler, requireApiUser } from "@/lib/apiAuth";
import { stripe, stripeLink } from "@/lib/payments";

/** POST: a link into the creator's Stripe dashboard (payouts, balance, bank details). */
export const POST = handler(async (req) => {
  const userId = await requireApiUser(req);
  const link = await stripeLink(userId);
  if (!link?.account_id) throw new ApiError(400, "Connect your Stripe account first");
  return { url: (await stripe().accounts.createLoginLink(link.account_id)).url };
});
