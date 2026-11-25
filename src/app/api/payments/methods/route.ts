import { ApiError, handler, requireApiUser } from "@/lib/apiAuth";
import { siteUrl } from "@/lib/constants";
import { customerFor, stripe, stripeLink } from "@/lib/payments";

/** GET: my saved payment methods (cards are only ever stored by Stripe). */
export const GET = handler(async (req) => {
  const userId = await requireApiUser(req);
  const link = await stripeLink(userId).catch(() => null);
  if (!link?.customer_id) return { methods: [] };
  const list = await stripe().customers.listPaymentMethods(link.customer_id, { limit: 20 });
  return {
    methods: list.data.map((m) => ({
      id: m.id, type: m.type,
      label: m.card ? `${m.card.brand[0].toUpperCase()}${m.card.brand.slice(1)} •••• ${m.card.last4}`
        : m.type === "link" ? `Link (${m.link?.email ?? "saved"})`
        : m.type === "us_bank_account" ? `Bank •••• ${m.us_bank_account?.last4 ?? ""}`
        : m.type,
      expires: m.card ? `${String(m.card.exp_month).padStart(2, "0")}/${String(m.card.exp_year).slice(-2)}` : null,
    })),
  };
});

/** POST: a Stripe page to save a new payment method. */
export const POST = handler(async (req) => {
  const userId = await requireApiUser(req);
  const s = await stripe().checkout.sessions.create({
    mode: "setup", currency: "usd", customer: await customerFor(userId),
    success_url: `${siteUrl()}/settings?saved=1#payments`, cancel_url: `${siteUrl()}/settings#payments`,
  });
  return { url: s.url };
});

/** DELETE ?id=pm_…: forget a saved payment method. */
export const DELETE = handler(async (req) => {
  const userId = await requireApiUser(req);
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const link = await stripeLink(userId);
  if (!link?.customer_id || !/^pm_[A-Za-z0-9]+$/.test(id)) throw new ApiError(404, "Not found");
  const pm = await stripe().paymentMethods.retrieve(id);
  if (pm.customer !== link.customer_id) throw new ApiError(404, "Not found");
  await stripe().paymentMethods.detach(id);
  return { removed: id };
});
