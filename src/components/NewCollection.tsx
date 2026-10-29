"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewCollection() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, is_public: isPublic }) });
    const out = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(out.error ?? res.statusText);
    router.push(`/collection/${out.id}`);
  }

  return (
    <form onSubmit={create} className="card flex flex-wrap items-center gap-3 p-4">
      <input className="input min-w-0 flex-1" placeholder="New collection name" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /> Public
      </label>
      <button className="btn-primary" disabled={busy || !title.trim()}>Create</button>
      {error && <p className="w-full text-sm text-red-300">{error}</p>}
    </form>
  );
}
