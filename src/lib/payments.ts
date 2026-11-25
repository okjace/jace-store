/**
 * Paid projects with Stripe (migration 014).
 *
 *  - Creators connect a Stripe account (Stripe Connect, Stripe-hosted sign-up) and are paid straight
 *    from each sale. Jace Store keeps nothing: only Stripe's card fee is passed on (lib/pricing.ts).
 *  - Buyers have a Stripe customer, so cards they save at checkout (or in Settings) are offered next
 *    time, for every creator. Card details only ever go to Stripe, never to Jace Store.
 *  - Purchases are recorded from Stripe's webhook and when the buyer comes back from checkout.
 *
 * Settings: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
 */
import Stripe from "stripe";
import { ApiError } from "./apiAuth";
import { siteUrl } from "./constants";
import { isPaid, stripeFeeCents, type Priced } from "./pricing";
import { createAdminClient } from "./supabase/admin";

let client: Stripe | null = null;

export const paymentsReady = () => !!process.env.STRIPE_SECRET_KEY;

export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new ApiError(503, "Payments aren't set up on Jace Store yet.");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY, { appInfo: { name: "Jace Store", url: siteUrl() } });
  return client;
}

export interface StripeLink {
  user_id: string;
  account_id: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  customer_id: string | null;
}

export async function stripeLink(userId: string): Promise<StripeLink | null> {
  const { data } = await createAdminClient().from("stripe_links").select("*").eq("user_id", userId).maybeSingle();
  return (data as StripeLink | null) ?? null;
}

async function saveLink(userId: string, values: Partial<StripeLink>) {
  const { error } = await createAdminClient().from("stripe_links")
    .upsert({ user_id: userId, ...values, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new ApiError(500, error.message.includes("stripe_links") ? "Jace Store's database needs migration 014 first" : error.message);
}

// --- creators ------------------------------------------------------------------------------------

/** The creator's Stripe account, made on first use (Stripe collects their details on its own pages). */
export async function sellerAccount(userId: string): Promise<string> {
  const link = await stripeLink(userId);
  if (link?.account_id) return link.account_id;
  const acct = await stripe().accounts.create({
    controller: {
      fees: { payer: "application" },
      losses: { payments: "application" },
      requirement_collection: "stripe",
      stripe_dashboard: { type: "express" },
    },
    capabilities: { transfers: { requested: true } },
    metadata: { jace_store_user: userId },
  });
  await saveLink(userId, { account_id: acct.id });
  return acct.id;
}

/** Ask Stripe whether the creator can be paid yet, and remember it. */
export async function refreshSeller(userId: string): Promise<StripeLink | null> {
  const link = await stripeLink(userId);
  if (!link?.account_id) return link;
  const acct = await stripe().accounts.retrieve(link.account_id);
  const ready = acct.capabilities?.transfers === "active";
  const next = { charges_enabled: ready, payouts_enabled: !!acct.payouts_enabled };
  if (next.charges_enabled !== link.charges_enabled || next.payouts_enabled !== link.payouts_enabled) await saveLink(userId, next);
  return { ...link, ...next };
}

export async function onboardingUrl(userId: string): Promise<string> {
  const account = await sellerAccount(userId);
  const link = await stripe().accountLinks.create({
    account, type: "account_onboarding",
    refresh_url: `${siteUrl()}/api/payments/seller?go=1`,
    return_url: `${siteUrl()}/api/payments/seller/return`,
  });
  return link.url;
}

// --- buyers --------------------------------------------------------------------------------------

/** The buyer's Stripe customer (where their saved payment methods live), made on first use. */
export async function customerFor(userId: string): Promise<string> {
  const link = await stripeLink(userId);
  if (link?.customer_id) return link.customer_id;
  const { data: profile } = await createAdminClient().from("profiles").select("username").eq("id", userId).maybeSingle();
  const c = await stripe().customers.create({
    description: profile?.username ? `Jace Store @${profile.username}` : "Jace Store",
    metadata: { jace_store_user: userId },
  });
  await saveLink(userId, { customer_id: c.id });
  return c.id;
}

export interface PaidProject extends Priced {
  id: string; slug: string; title: string; summary?: string | null; icon_url?: string | null; owner_id: string;
}

/** A Stripe Checkout page for buying (or subscribing to) a project. */
export async function checkoutUrl(userId: string, project: PaidProject, amountCents?: number): Promise<string> {
  if (!isPaid(project)) throw new ApiError(400, "This project is free");
  if (project.owner_id === userId) throw new ApiError(400, "It's your own project");
  const seller = await refreshSeller(project.owner_id);
  if (!seller?.account_id || !seller.charges_enabled) throw new ApiError(409, "The creator can't take payments right now. Try again later.");
  let amount = project.price_cents!;
  if (project.price_type === "one_time" && project.pay_what_you_want && amountCents != null) {
    if (!Number.isInteger(amountCents) || amountCents < amount) throw new ApiError(400, `Pay at least $${(amount / 100).toFixed(2)}`);
    if (amountCents > 100_000) throw new ApiError(400, "That's more than $1,000");
    amount = amountCents;
  }
  const customer = await customerFor(userId);
  const meta = { jace_store_user: userId, project_id: project.id, kind: project.price_type! };
  const product = {
    name: project.title,
    ...(project.summary ? { description: project.summary.slice(0, 300) } : {}),
    ...(project.icon_url?.startsWith("https://") ? { images: [project.icon_url] } : {}),
  };
  const common = {
    customer,
    client_reference_id: userId,
    metadata: meta,
    success_url: `${siteUrl()}/api/payments/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl()}/project/${project.slug}`,
  };
  const session = project.price_type === "subscription"
    ? await stripe().checkout.sessions.create({
        ...common,
        mode: "subscription",
        line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: amount, product_data: product, recurring: { interval: project.sub_interval ?? "month" } } }],
        subscription_data: {
          metadata: meta,
          transfer_data: { destination: seller.account_id },
          // Stripe's fee as a percent of the price (rounded up), so the creator gets the rest
          application_fee_percent: Math.ceil((stripeFeeCents(amount) / amount) * 10000) / 100,
        },
      })
    : await stripe().checkout.sessions.create({
        ...common,
        mode: "payment",
        line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: amount, product_data: product } }],
        payment_intent_data: {
          metadata: meta,
          transfer_data: { destination: seller.account_id },
          application_fee_amount: Math.min(stripeFeeCents(amount), amount - 1),
        },
        // "Save my card for next time", and cards saved before are offered
        saved_payment_method_options: { payment_method_save: "enabled", allow_redisplay_filters: ["always", "limited", "unspecified"] },
      });
  if (!session.url) throw new ApiError(502, "Stripe didn't give a checkout page");
  return session.url;
}

// --- recording purchases -------------------------------------------------------------------------

const periodEnd = (s: Stripe.Subscription) => {
  const end = (s as unknown as { current_period_end?: number }).current_period_end ?? s.items?.data?.[0]?.current_period_end;
  return end ? new Date(end * 1000).toISOString() : null;
};

/** Record what a finished checkout bought (from the webhook or the buyer's return; safe to repeat). */
export async function recordCheckout(sessionOrId: string | Stripe.Checkout.Session) {
  const s = typeof sessionOrId === "string"
    ? await stripe().checkout.sessions.retrieve(sessionOrId, { expand: ["subscription"] })
    : sessionOrId;
  const userId = s.metadata?.jace_store_user, projectId = s.metadata?.project_id;
  if (!userId || !projectId || s.status !== "complete") return null;
  const admin = createAdminClient();
  const base = {
    user_id: userId, project_id: projectId, amount_cents: s.amount_total ?? 0, currency: s.currency ?? "usd",
    stripe_checkout_session_id: s.id, updated_at: new Date().toISOString(),
  };
  if (s.mode === "subscription") {
    const sub = typeof s.subscription === "string" ? await stripe().subscriptions.retrieve(s.subscription) : s.subscription;
    if (!sub) return null;
    await admin.from("purchases").upsert({
      ...base, kind: "subscription", status: sub.status, stripe_subscription_id: sub.id,
      sub_interval: sub.items.data[0]?.price?.recurring?.interval ?? null,
      current_period_end: periodEnd(sub), cancel_at_period_end: sub.cancel_at_period_end,
    }, { onConflict: "stripe_checkout_session_id" });
  } else {
    if (s.payment_status !== "paid") return null;
    await admin.from("purchases").upsert({
      ...base, kind: "one_time", status: "paid",
      stripe_payment_intent_id: typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null,
    }, { onConflict: "stripe_checkout_session_id" });
  }
  return { userId, projectId };
}

export async function recordSubscription(sub: Stripe.Subscription) {
  await createAdminClient().from("purchases").update({
    status: sub.status, current_period_end: periodEnd(sub), cancel_at_period_end: sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  }).eq("stripe_subscription_id", sub.id);
}

export async function recordRefund(charge: Stripe.Charge) {
  const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!pi || !charge.refunded) return;                 // partly refunded: they keep it
  await createAdminClient().from("purchases").update({ status: "refunded", updated_at: new Date().toISOString() })
    .eq("stripe_payment_intent_id", pi);
}

// --- access --------------------------------------------------------------------------------------

/** Can this person download this project's files? (Free, theirs, bought, or subscribed.) */
export async function hasAccess(userId: string | null, project: Priced & { id: string; owner_id: string }): Promise<boolean> {
  if (!isPaid(project)) return true;
  if (!userId) return false;
  if (userId === project.owner_id) return true;
  return (await purchaseFor(userId, project.id)) !== null;
}

/** The purchase that gives this person access to a project right now, if any. */
export async function purchaseFor(userId: string, projectId: string) {
  const { data } = await createAdminClient().from("purchases")
    .select("id, kind, status, amount_cents, sub_interval, current_period_end, cancel_at_period_end, created_at")
    .eq("user_id", userId).eq("project_id", projectId).order("created_at", { ascending: false });
  const now = Date.now();
  return (data ?? []).find((p) => p.kind === "one_time"
    ? p.status === "paid"
    : ["active", "trialing", "past_due"].includes(p.status) && (!p.current_period_end || new Date(p.current_period_end).getTime() > now)) ?? null;
}

/** Cancel subscriptions to these projects or by this buyer (project or account deleted). Never throws. */
export async function cancelSubscriptions(filter: { projectId?: string; userId?: string }) {
  if (!paymentsReady()) return;
  try {
    let q = createAdminClient().from("purchases").select("stripe_subscription_id")
      .eq("kind", "subscription").in("status", ["active", "trialing", "past_due", "incomplete"]);
    if (filter.projectId) q = q.eq("project_id", filter.projectId);
    if (filter.userId) q = q.eq("user_id", filter.userId);
    const { data } = await q;
    for (const p of data ?? []) {
      if (p.stripe_subscription_id) await stripe().subscriptions.cancel(p.stripe_subscription_id).catch(() => null);
    }
  } catch {
    // before migration 014
  }
}

/** A project's price and owner (all columns, so it works before migration 014 too). */
export async function projectPricing(projectId: string): Promise<(Priced & { id: string; owner_id: string; slug: string; title: string }) | null> {
  const { data } = await createAdminClient().from("projects").select("*").eq("id", projectId).maybeSingle();
  return data;
}
