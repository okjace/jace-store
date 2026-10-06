"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/constants";

interface Token { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null }

export default function TokenManager({ tokens }: { tokens: Token[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name || "CLI" }),
    });
    const out = await res.json();
    if (!res.ok) return setError(out.error);
    setCreated(out.token);
    setName("");
    router.refresh();
  }

  async function revoke(t: Token) {
    if (!confirm(`Revoke "${t.name}"? Anything using it stops working immediately.`)) return;
    const { error } = await createClient().from("api_tokens").delete().eq("id", t.id);
    if (error) return setError(error.message);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="card flex flex-wrap gap-2 p-4">
        <input className="input min-w-0 flex-1" placeholder='Token name, e.g. "Claude on my laptop"' value={name} onChange={(e) => setName(e.target.value)} maxLength={64} />
        <button className="btn-primary">Create token</button>
      </form>
      {created && (
        <div className="card border-brand/50 p-4">
          <p className="text-sm text-brand">Copy this token now. It won&apos;t be shown again.</p>
          <div className="mt-2 flex gap-2">
            <code className="input flex-1 overflow-x-auto font-mono text-xs whitespace-nowrap">{created}</code>
            <button className="btn-ghost" onClick={async () => { await navigator.clipboard.writeText(created); setCopied(true); }}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}
      <div className="card divide-y divide-line">
        {tokens.map((t) => (
          <div key={t.id} className="flex items-center gap-3 p-4 text-sm">
            <div className="flex-1">
              <b>{t.name}</b> <code className="text-xs text-muted">{t.prefix}…</code>
              <div className="text-xs text-muted">
                created {timeAgo(t.created_at)} · {t.last_used_at ? `last used ${timeAgo(t.last_used_at)}` : "never used"}
              </div>
            </div>
            <button onClick={() => revoke(t)} className="btn-danger px-3! py-1! text-xs">Revoke</button>
          </div>
        ))}
        {tokens.length === 0 && <p className="p-4 text-sm text-muted">No tokens yet.</p>}
      </div>
    </div>
  );
}
