"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { money } from "@/lib/pricing";

export interface PurchaseRow {
  id: string; kind: "one_time" | "subscription"; status: string; amount_cents: number; sub_interval: string | null;
  current_period_end: string | null; cancel_at_period_end: boolean; created_at: string;
  project: { slug: string; title: string } | null;
}

type Method = { id: string; label: string; expires: string | null };

const day = (t: string) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? res.statusText);
  return out;
}

/** Saved payment methods (kept by Stripe) and everything you bought or subscribe to. */
export default function PaymentSettings({ purchases, saved }: { purchases: PurchaseRow[]; saved: boolean }) {
  const [methods, setMethods] = useState<Method[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(saved ? { ok: true, text: "Payment method saved." } : null);

  const load = () => call("/api/payments/methods").then((o) => setMethods(o.methods)).catch(() => setMethods([]));
  useEffect(() => { load(); }, []);

  async function go(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }
  const open = (url: string) => go(url, async () => { window.location.href = (await call(url, { method: "POST" })).url; });

  return (
    <section id="payments" className="card scroll-mt-24 space-y-5 p-6">
      <div>
        <h2 className="text-lg font-bold">Payments</h2>
        <p className="mt-1 text-sm text-muted">
          Save a card to buy faster: it&apos;s offered at checkout for every project. Cards are stored by Stripe, never by Jace Store.
        </p>
      </div>

      <div className="space-y-2">
        <span className="label">Saved payment methods</span>
        {methods === null && <p className="text-sm text-muted">Loading…</p>}
        {methods?.length === 0 && <p className="text-sm text-muted">None yet. You can also tick &quot;Save my info&quot; when you buy something.</p>}
        {methods?.map((m) => (
          <div key={m.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm">
            <span className="flex-1">{m.label}{m.expires && <span className="text-muted"> · expires {m.expires}</span>}</span>
            <button type="button" className="btn-ghost px-2! py-1! text-xs" disabled={busy === m.id}
              onClick={() => confirm(`Remove ${m.label}?`) && go(m.id, async () => {
                await call(`/api/payments/methods?id=${encodeURIComponent(m.id)}`, { method: "DELETE" });
                await load();
              })}>
              Remove
            </button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" className="btn-primary" disabled={!!busy} onClick={() => open("/api/payments/methods")}>Add a payment method</button>
          <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => open("/api/payments/portal")}>Subscriptions & receipts</button>
        </div>
      </div>

      <div className="space-y-2">
        <span className="label">Purchases</span>
        {purchases.length === 0 && <p className="text-sm text-muted">Nothing bought yet.</p>}
        {purchases.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line px-3 py-2 text-sm">
            {p.project
              ? <Link href={`/project/${p.project.slug}`} className="flex-1 font-medium hover:underline">{p.project.title}</Link>
              : <span className="flex-1 text-muted">(deleted project)</span>}
            <span className="text-muted">
              {p.kind === "subscription"
                ? `${money(p.amount_cents)}/${p.sub_interval ?? "month"} · ${p.status === "active" || p.status === "trialing"
                    ? `${p.cancel_at_period_end ? "ends" : "renews"} ${p.current_period_end ? day(p.current_period_end) : ""}`
                    : p.status.replace("_", " ")}`
                : `${money(p.amount_cents)} · ${p.status === "refunded" ? "refunded" : `bought ${day(p.created_at)}`}`}
            </span>
          </div>
        ))}
        {purchases.some((p) => p.kind === "subscription") && (
          <p className="text-xs text-muted">Cancel or change a subscription under Subscriptions & receipts.</p>
        )}
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-brand" : "text-red-300"}`}>{msg.text}</p>}
    </section>
  );
}
