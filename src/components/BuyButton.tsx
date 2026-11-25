"use client";
import { useState } from "react";
import { money, priceLabel, type Priced } from "@/lib/pricing";

/** Buy (or subscribe to) a paid project: Stripe's checkout page, with any cards you saved before. */
export default function BuyButton({
  slug, price, signedIn, loginHref, className = "btn-primary px-6! py-2.5! text-base",
}: {
  slug: string;
  price: Priced;
  signedIn: boolean;
  loginHref: string;
  className?: string;
}) {
  const pwyw = price.price_type === "one_time" && !!price.pay_what_you_want;
  const min = price.price_cents ?? 0;
  const [amount, setAmount] = useState((min / 100).toFixed(2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cents = Math.round(Number(amount) * 100);
  const label = price.price_type === "subscription" ? `Subscribe · ${priceLabel(price)}` : `Buy · ${pwyw ? money(cents >= min ? cents : min) : priceLabel(price)}`;

  if (!signedIn) return <a href={loginHref} className={className}>Sign in to buy · {priceLabel(price)}</a>;

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...(pwyw ? { amount_cents: cents } : {}) }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.url) throw new Error(out.error ?? res.statusText);
      window.location.href = out.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {pwyw && (
          <label className="flex items-center gap-1 text-sm text-muted">
            $<input type="number" min={(min / 100).toFixed(2)} step="0.01" value={amount} aria-label="How much to pay"
              onChange={(e) => setAmount(e.target.value)} className="input w-24! py-2!" />
          </label>
        )}
        <button type="button" onClick={buy} disabled={busy || (pwyw && !(cents >= min))} className={className}>
          {busy ? "Opening checkout…" : label}
        </button>
      </div>
      {pwyw && <span className="text-xs text-muted">Pay what you want, at least {money(min)}</span>}
      {error && <span className="text-sm text-red-300">{error}</span>}
    </div>
  );
}
