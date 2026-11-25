import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { recordCheckout, recordRefund, recordSubscription, stripe } from "@/lib/payments";

/**
 * Stripe's webhook (Stripe dashboard → Developers → Webhooks → this URL), with the events
 * checkout.session.completed, checkout.session.async_payment_succeeded,
 * customer.subscription.updated, customer.subscription.deleted and charge.refunded.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET isn't set" }, { status: 503 });
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await recordCheckout(event.data.object.id);
      break;
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await recordSubscription(event.data.object);
      break;
    case "charge.refunded":
      await recordRefund(event.data.object);
      break;
  }
  return NextResponse.json({ received: true });
}
