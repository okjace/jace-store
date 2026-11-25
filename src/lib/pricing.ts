// Prices of paid projects (migration 014). Shared by the server and the browser.

export type PriceType = "free" | "one_time" | "subscription";

export interface Priced {
  price_type?: PriceType | null;
  price_cents?: number | null;
  pay_what_you_want?: boolean | null;
  sub_interval?: "month" | "year" | null;
}

export const MIN_PRICE_CENTS = 100;
export const MAX_PRICE_CENTS = 100_000;

export const isPaid = (p: Priced) => !!p.price_type && p.price_type !== "free" && (p.price_cents ?? 0) > 0;

export const money = (cents: number) =>
  `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

/** "$5", "$5+" (pay what you want), "$3/month". Null when free. */
export function priceLabel(p: Priced): string | null {
  if (!isPaid(p)) return null;
  const amount = money(p.price_cents!);
  if (p.price_type === "subscription") return `${amount}/${p.sub_interval ?? "month"}`;
  return p.pay_what_you_want ? `${amount}+` : amount;
}

/**
 * Stripe's card fee (2.9% + 30¢ in the US), passed on so the creator gets everything else:
 * Jace Store itself takes nothing.
 */
export const stripeFeeCents = (cents: number) => Math.round(cents * 0.029) + 30;

/** For the API: null when free. */
export function priceOut(p: Priced) {
  if (!isPaid(p)) return null;
  return {
    type: p.price_type, amount_cents: p.price_cents, currency: "usd",
    interval: p.price_type === "subscription" ? p.sub_interval ?? "month" : null,
    pay_what_you_want: p.price_type === "one_time" && !!p.pay_what_you_want,
    label: priceLabel(p),
  };
}
