"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { money, stripeFeeCents, type PriceType } from "@/lib/pricing";
import type { Project } from "@/lib/types";

/** Free, a one-time price (optionally pay what you want), or a subscription. */
export default function ProjectPricing({ project, sellerReady, available }: { project: Project; sellerReady: boolean; available: boolean }) {
  const router = useRouter();
  const [type, setType] = useState<PriceType>(project.price_type ?? "free");
  const [amount, setAmount] = useState(project.price_cents ? (project.price_cents / 100).toFixed(2) : "5.00");
  const [pwyw, setPwyw] = useState(!!project.pay_what_you_want);
  const [interval, setInterval] = useState<"month" | "year">(project.sub_interval ?? "month");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const cents = Math.round(Number(amount) * 100);
  const wasFree = (project.price_type ?? "free") === "free";

  async function save() {
    if (type !== "free" && wasFree && !confirm("Make this project paid?\n\nIts uploaded files move to private storage: old download links stop "
      + "working, and only people who buy it can download. Launchers without a Jace Store sign-in can't install it any more.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/cli/projects/${project.slug}/pricing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, price_cents: cents, pay_what_you_want: pwyw, interval }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error ?? res.statusText);
      const failed: string[] = out.files_failed ?? [];
      setMsg({
        ok: !failed.length,
        text: (type === "free" ? "It's free now." : `Saved: ${out.price.label}.`)
          + (out.files_made_private ? ` ${out.files_made_private} file${out.files_made_private === 1 ? "" : "s"} made private.` : "")
          + (failed.length ? ` Couldn't move: ${failed.join("; ")}. Save again to retry.` : ""),
      });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const option = (t: PriceType, title: string, text: string) => (
    <label className={`card flex cursor-pointer gap-3 p-3 ${type === t ? "border-brand" : ""}`}>
      <input type="radio" name="price-type" checked={type === t} onChange={() => setType(t)} disabled={t !== "free" && !sellerReady} />
      <span><b>{title}</b><span className="block text-xs text-muted">{text}</span></span>
    </label>
  );

  return (
    <div className="card space-y-4 p-6">
      <div>
        <h2 className="text-lg font-bold">Price</h2>
        <p className="mt-1 text-sm text-muted">
          Sell this project, paid straight to your Stripe account. Jace Store takes nothing; Stripe keeps its card fee
          (about 2.9% + 30¢).
        </p>
      </div>
      {!available && <p className="text-sm text-amber-300">Payments aren&apos;t set up on Jace Store yet.</p>}
      {available && !sellerReady && (
        <p className="text-sm text-amber-300">
          To sell, first <Link href="/settings#selling" className="underline">connect your Stripe account in Settings → Selling</Link>.
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        {option("free", "Free", "Anyone can download it")}
        {option("one_time", "One-time price", "Buy once, keep every update")}
        {option("subscription", "Subscription", "Access while subscribed")}
      </div>
      {type !== "free" && (
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm">
            <span className="label">{type === "one_time" && pwyw ? "Minimum price (USD)" : "Price (USD)"}</span>
            <span className="flex items-center gap-1">$<input type="number" min="1" max="1000" step="0.01" className="input w-28!"
              value={amount} onChange={(e) => setAmount(e.target.value)} /></span>
          </label>
          {type === "subscription" && (
            <label className="text-sm">
              <span className="label">Every</span>
              <select className="input w-auto!" value={interval} onChange={(e) => setInterval(e.target.value as "month" | "year")}>
                <option value="month">month</option>
                <option value="year">year</option>
              </select>
            </label>
          )}
          {type === "one_time" && (
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input type="checkbox" checked={pwyw} onChange={(e) => setPwyw(e.target.checked)} /> Pay what you want (people can pay more)
            </label>
          )}
          {cents >= 100 && (
            <p className="pb-2 text-xs text-muted">You get about {money(cents - stripeFeeCents(cents))} of each {money(cents)}.</p>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" disabled={busy || (type !== "free" && !(cents >= 100 && cents <= 100_000))} onClick={save}>
          {busy ? "Saving…" : "Save price"}
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-brand" : "text-red-300"}`}>{msg.text}</span>}
      </div>
      {type !== "free" && (
        <p className="text-xs text-muted">
          Paid projects can&apos;t have link files, and their files are only handed to buyers. Changing the price doesn&apos;t change
          what existing subscribers pay.
        </p>
      )}
    </div>
  );
}
