"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface Mine { id: string; title: string; is_public: boolean; count: number; has?: boolean }

/** "Save" button on a project: add it to (or remove it from) your collections, or make a new one. */
export default function SaveToCollection({ projectId, signedIn, loginHref }: { projectId: string; signedIn: boolean; loginHref: string }) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<Mine[] | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    fetch(`/api/collections?project=${projectId}`).then((r) => r.json()).then((d) => setMine(Array.isArray(d) ? d : [])).catch(() => setMine([]));
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open, projectId]);

  async function toggle(c: Mine) {
    setBusy(c.id);
    setError(null);
    const res = c.has
      ? await fetch(`/api/collections/${c.id}/items?project_id=${projectId}`, { method: "DELETE" })
      : await fetch(`/api/collections/${c.id}/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: projectId }) });
    const out = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(out.error ?? res.statusText);
    setMine((m) => m?.map((x) => (x.id === c.id ? { ...x, has: !c.has, count: x.count + (c.has ? -1 : 1) } : x)) ?? null);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy("new");
    setError(null);
    const res = await fetch("/api/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, project_id: projectId }) });
    const out = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(out.error ?? res.statusText);
    setMine((m) => [{ id: out.id, title: out.title, is_public: out.is_public, count: 1, has: true }, ...(m ?? [])]);
    setTitle("");
  }

  if (!signedIn) return <a href={loginHref} className="btn-ghost">☆ Save</a>;
  const saved = mine?.some((c) => c.has);
  return (
    <div className="relative" ref={box}>
      <button type="button" className="btn-ghost" onClick={() => setOpen(!open)} aria-expanded={open}>{saved ? "★ Saved" : "☆ Save"}</button>
      {open && (
        <div className="card absolute right-0 z-40 mt-2 w-72 p-3 shadow-xl">
          <div className="label">Save to a collection</div>
          {!mine && <p className="text-sm text-muted">Loading…</p>}
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {mine?.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-panel-2">
                <input type="checkbox" checked={!!c.has} disabled={busy === c.id} onChange={() => toggle(c)} />
                <span className="flex-1 truncate">{c.title}</span>
                <span className="text-xs text-muted">{c.is_public ? "" : "🔒 "}{c.count}</span>
              </label>
            ))}
          </div>
          <form onSubmit={create} className="mt-2 flex gap-2 border-t border-line pt-2">
            <input className="input py-1! text-sm" placeholder="New collection…" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
            <button className="btn-primary px-3! py-1! text-sm" disabled={!title.trim() || busy === "new"}>Add</button>
          </form>
          {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
          <Link href="/collections" className="mt-2 block text-xs text-muted hover:text-text">Your collections →</Link>
        </div>
      )}
    </div>
  );
}
