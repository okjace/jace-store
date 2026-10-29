"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CollectionEditor({ collection, projects }: {
  collection: { id: string; title: string; description: string; is_public: boolean };
  projects: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(collection.title);
  const [description, setDescription] = useState(collection.description);
  const [isPublic, setIsPublic] = useState(collection.is_public);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(out.error ?? res.statusText); return false; }
    return true;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (await call(`/api/collections/${collection.id}`, "PATCH", { title, description, is_public: isPublic })) { setOpen(false); router.refresh(); }
  }

  async function remove() {
    if (!confirm(`Delete "${collection.title}"? The projects in it aren't affected.`)) return;
    if (await call(`/api/collections/${collection.id}`, "DELETE")) router.push("/collections");
  }

  if (!open) {
    return (
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-ghost" onClick={() => setOpen(true)}>Edit collection</button>
        <button className="btn-ghost" onClick={async () => { await navigator.clipboard.writeText(window.location.href); }}>Copy link</button>
      </div>
    );
  }
  return (
    <form onSubmit={save} className="mt-4 space-y-3 border-t border-line pt-4">
      <div>
        <label className="label" htmlFor="ct">Name</label>
        <input id="ct" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required />
      </div>
      <div>
        <label className="label" htmlFor="cd">Description</label>
        <textarea id="cd" className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /> Public (anyone with the link, and on your profile)</label>
      {projects.length > 0 && (
        <div>
          <span className="label">Projects</span>
          <ul className="space-y-1">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">{p.title}</span>
                <button type="button" className="text-xs text-red-300 hover:underline" disabled={busy}
                  onClick={async () => { if (await call(`/api/collections/${collection.id}/items?project_id=${p.id}`, "DELETE")) router.refresh(); }}>remove</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy}>Save</button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
        <button type="button" className="btn-danger ml-auto" onClick={remove} disabled={busy}>Delete collection</button>
      </div>
    </form>
  );
}
