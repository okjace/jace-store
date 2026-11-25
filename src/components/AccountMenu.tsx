"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Account = { jace_id: string; username: string | null; display_name: string | null; picture: string | null; current: boolean };

function Avatar({ a, size = 28 }: { a: { picture: string | null; display_name: string | null; username: string | null }; size?: number }) {
  const letter = (a.display_name || a.username || "?")[0]?.toUpperCase();
  return a.picture
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={a.picture} alt="" width={size} height={size} className="shrink-0 rounded-full border border-line object-cover" style={{ width: size, height: size }} />
    : <span className="grid shrink-0 place-items-center rounded-full bg-panel-2 text-xs font-bold" style={{ width: size, height: size }}>{letter}</span>;
}

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? res.statusText);
  return out;
}

/**
 * The signed-in account in the corner, plus every Jace account used on this device: switch with one
 * click, add another (Jace shows its account picker), remove, or sign out of all.
 */
export default function AccountMenu({ me }: { me: { display_name: string | null; username: string | null; picture: string | null } | null }) {
  const path = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const load = () => call("/api/auth/accounts").then((o) => setAccounts(o.accounts)).catch(() => setAccounts([]));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function switchTo(a: Account) {
    setBusy(a.jace_id);
    setNote(null);
    try {
      const out = await call("/api/auth/accounts/switch", { method: "POST", body: JSON.stringify({ jace_id: a.jace_id, next: path }) });
      if (out.reauth) { window.location.href = out.reauth; return; }
      if (out.removed) { setNote(out.message); await load(); setBusy(null); return; }
      window.location.reload();
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  async function remove(a: Account) {
    if (!confirm(`Remove @${a.username ?? "this account"} from this device?${a.current ? " You'll be signed out." : ""}`)) return;
    setBusy(a.jace_id);
    try {
      const out = await call(`/api/auth/accounts?jace_id=${encodeURIComponent(a.jace_id)}`, { method: "DELETE" });
      if (out.signed_out) { window.location.href = "/"; return; }
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function signOutAll() {
    if (!confirm("Sign out and remove every account from this device?")) return;
    setBusy("all");
    await call("/api/auth/accounts/signout-all", { method: "POST" }).catch(() => null);
    window.location.href = "/";
  }

  const others = (accounts ?? []).filter((a) => !a.current);
  const addHref = `/api/auth/jace/start?add=1&next=${encodeURIComponent(path)}`;

  // signed out, nobody remembered here: the plain button
  if (!me && !others.length) return <Link href={`/login?next=${encodeURIComponent(path)}`} className="btn-primary">Sign in</Link>;

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="btn-ghost flex max-w-56 items-center gap-2 px-2!"
        aria-haspopup="menu" aria-expanded={open} title={me?.username ? `@${me.username}` : "Accounts"}>
        {me ? <><Avatar a={me} size={24} /><span className="truncate">{me.display_name ?? me.username ?? "Account"}</span></> : "Sign in"}
        <span className="text-xs text-muted">▾</span>
      </button>
      {open && (
        <div role="menu" className="card absolute right-0 z-40 mt-2 w-72 space-y-1 p-2 text-sm shadow-xl">
          {me && (
            <div className="flex items-center gap-3 rounded-lg px-2 py-2">
              <Avatar a={me} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{me.display_name ?? me.username}</div>
                {me.username && <div className="truncate text-xs text-muted">@{me.username}</div>}
              </div>
              {(accounts ?? []).find((a) => a.current) && (
                <button type="button" className="text-xs text-muted hover:text-red-300" disabled={!!busy}
                  onClick={() => remove((accounts ?? []).find((a) => a.current)!)}>Remove</button>
              )}
            </div>
          )}
          {me && (
            <div className="flex gap-1 border-b border-line px-1 pb-2">
              <Link href="/dashboard" className="btn-ghost flex-1 px-2! py-1! text-xs" onClick={() => setOpen(false)}>Dashboard</Link>
              <Link href="/settings" className="btn-ghost flex-1 px-2! py-1! text-xs" onClick={() => setOpen(false)}>Settings</Link>
            </div>
          )}
          {others.map((a) => (
            <div key={a.jace_id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-panel-2">
              <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" disabled={!!busy} onClick={() => switchTo(a)}>
                <Avatar a={a} />
                <span className="min-w-0">
                  <span className="block truncate">{a.display_name ?? a.username}</span>
                  <span className="block truncate text-xs text-muted">{busy === a.jace_id ? "Switching…" : a.username ? `@${a.username}` : ""}</span>
                </span>
              </button>
              <button type="button" className="text-xs text-muted opacity-0 hover:text-red-300 group-hover:opacity-100 focus:opacity-100"
                aria-label={`Remove @${a.username}`} disabled={!!busy} onClick={() => remove(a)}>✕</button>
            </div>
          ))}
          <a href={addHref} className="block rounded-lg px-2 py-2 text-brand hover:bg-panel-2">+ Add another Jace account</a>
          {note && <p className="px-2 py-1 text-xs text-amber-300">{note}</p>}
          <div className="flex gap-1 border-t border-line px-1 pt-2">
            {me && (
              <form action="/auth/signout" method="post" className="flex-1">
                <button className="btn-ghost w-full px-2! py-1! text-xs">Sign out</button>
              </form>
            )}
            {(accounts?.length ?? 0) > 0 && (
              <button type="button" className="btn-ghost flex-1 px-2! py-1! text-xs" disabled={!!busy} onClick={signOutAll}>Sign out of all</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
