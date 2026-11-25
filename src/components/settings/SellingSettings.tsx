"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { money } from "@/lib/pricing";

export interface SaleRow {
  id: string; kind: "one_time" | "subscription"; status: string; amount_cents: number; sub_interval: string | null; created_at: string;
  project: { slug: string; title: string } | null;
  buyer: { username: string } | null;
}

/** Get paid for your projects: connect a Stripe account, see sales, refund. */
export default function SellingSettings({
  available, connected, ready, payouts, sales,
}: {
  available: boolean; connected: boolean; ready: boolean; payouts: boolean; sales: SaleRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function post(key: string, url: string, body?: unknown) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error ?? res.statusText);
      if (out.url) window.location.href = out.url;
      else router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }
  const total = sales.filter((s) => s.status !== "refunded").reduce((n, s) => n + s.amount_cents, 0);

  return (
    <section id="selling" className="card scroll-mt-24 space-y-4 p-6">
      <div>
        <h2 className="text-lg font-bold">Selling</h2>
        <p className="mt-1 text-sm text-muted">
          Sell projects for a one-time price or a subscription. You&apos;re paid straight into your own Stripe account; Jace Store
          takes nothing (Stripe keeps its card fee). Set a price on a project&apos;s Manage page.
        </p>
      </div>
      {!available ? (
        <p className="text-sm text-amber-300">Payments aren&apos;t set up on Jace Store yet.</p>
      ) : ready ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-brand">✓ Stripe connected: you can sell.</span>
          {!payouts && <span className="text-amber-300">Add your bank details in Stripe to get paid out.</span>}
          <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => post("dash", "/api/payments/seller/dashboard")}>
            Open my Stripe dashboard
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button type="button" className="btn-primary" disabled={!!busy} onClick={() => post("connect", "/api/payments/seller")}>
            {connected ? "Finish setting up Stripe" : "Connect Stripe to sell"}
          </button>
          <span className="text-muted">Stripe asks for your details and bank account on its own pages.</span>
        </div>
      )}
      {sales.length > 0 && (
        <div className="space-y-2">
          <span className="label">Sales ({money(total)} in total, before Stripe&apos;s fees)</span>
          {sales.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line px-3 py-2 text-sm">
              <span className="flex-1">
                {s.project ? <Link href={`/project/${s.project.slug}`} className="font-medium hover:underline">{s.project.title}</Link> : "(deleted)"}
                <span className="text-muted"> · @{s.buyer?.username ?? "deleted"} · {new Date(s.created_at).toLocaleDateString()}</span>
              </span>
              <span className="text-muted">
                {money(s.amount_cents)}{s.kind === "subscription" ? `/${s.sub_interval ?? "month"}` : ""} · {s.status.replace("_", " ")}
              </span>
              {((s.kind === "one_time" && s.status === "paid") || (s.kind === "subscription" && ["active", "trialing", "past_due"].includes(s.status))) && (
                <button type="button" className="btn-ghost px-2! py-1! text-xs" disabled={!!busy}
                  onClick={() => confirm(s.kind === "one_time"
                    ? `Refund ${money(s.amount_cents)} to @${s.buyer?.username}? They lose access, and it comes out of your Stripe balance.`
                    : `End @${s.buyer?.username}'s subscription now?`) && post(s.id, "/api/payments/refund", { purchase_id: s.id })}>
                  {s.kind === "one_time" ? "Refund" : "End subscription"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}
    </section>
  );
}
