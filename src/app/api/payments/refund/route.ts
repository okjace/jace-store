import { ApiError, handler, readJson, requireApiUser } from "@/lib/apiAuth";
import { stripe } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST { purchase_id }: the creator refunds a purchase (one-time: full refund, the money comes back
 * out of their Stripe balance) or ends a subscription now.
 */
export const POST = handler(async (req) => {
  const userId = await requireApiUser(req);
  const { purchase_id } = await readJson<{ purchase_id?: string }>(req);
  const admin = createAdminClient();
  const { data: p } = await admin.from("purchases").select("*, project:projects(owner_id)").eq("id", String(purchase_id ?? "")).maybeSingle();
  if (!p || p.project?.owner_id !== userId) throw new ApiError(404, "Sale not found");
  if (p.kind === "one_time") {
    if (p.status !== "paid" || !p.stripe_payment_intent_id) throw new ApiError(400, "This sale can't be refunded");
    await stripe().refunds.create({ payment_intent: p.stripe_payment_intent_id, reverse_transfer: true, refund_application_fee: true });
    await admin.from("purchases").update({ status: "refunded", updated_at: new Date().toISOString() }).eq("id", p.id);
    return { refunded: p.id };
  }
  if (!p.stripe_subscription_id) throw new ApiError(400, "No subscription");
  const sub = await stripe().subscriptions.cancel(p.stripe_subscription_id);
  await admin.from("purchases").update({ status: sub.status, updated_at: new Date().toISOString() }).eq("id", p.id);
  return { canceled: p.id };
});
