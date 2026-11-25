"use client";
import { useEffect, useState } from "react";

type Account = { jace_id: string; username: string | null; display_name: string | null; picture: string | null };

/** On the sign-in page: Jace accounts used on this device before, one click each. */
export default function RememberedAccounts({ next }: { next: string }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/auth/accounts").then((r) => r.json()).then((o) => setAccounts(o.accounts ?? [])).catch(() => {});
  }, []);
  if (!accounts.length) return null;

  async function go(a: Account) {
    setBusy(a.jace_id);
    setNote(null);
    const res = await fetch("/api/auth/accounts/switch", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jace_id: a.jace_id, next }),
    });
    const out = await res.json().catch(() => ({}));
    if (out.reauth) { window.location.href = out.reauth; return; }
    if (out.removed) { setNote(out.message); setAccounts(accounts.filter((x) => x.jace_id !== a.jace_id)); setBusy(null); return; }
    if (!res.ok) { setNote(out.error ?? "Couldn't switch"); setBusy(null); return; }
    window.location.href = next;
  }

  return (
    <div className="space-y-2 text-left">
      {accounts.map((a) => (
        <button key={a.jace_id} type="button" disabled={!!busy} onClick={() => go(a)}
          className="flex w-full items-center gap-3 rounded-lg border border-line px-3 py-2 hover:bg-panel-2">
          {a.picture
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={a.picture} alt="" className="h-8 w-8 rounded-full object-cover" />
            : <span className="grid h-8 w-8 place-items-center rounded-full bg-panel-2 font-bold">{(a.display_name || a.username || "?")[0]?.toUpperCase()}</span>}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">Continue as {a.display_name ?? a.username}</span>
            {a.username && <span className="block truncate text-xs text-muted">@{a.username}</span>}
          </span>
          {busy === a.jace_id && <span className="text-xs text-muted">…</span>}
        </button>
      ))}
      {note && <p className="text-xs text-amber-300">{note}</p>}
    </div>
  );
}
