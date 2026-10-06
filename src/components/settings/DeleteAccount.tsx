"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function DeleteAccount({ username, projectCount }: { username: string; projectCount: number }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      return setError(out.error ?? res.statusText);
    }
    await createClient().auth.signOut().catch(() => {});
    window.location.href = "/?deleted=1";
  }

  return (
    <div id="delete" className="card scroll-mt-24 border-red-500/30 p-6">
      <h2 className="text-lg font-bold text-red-300">Delete account</h2>
      <p className="mt-1 text-sm text-muted">
        Permanently deletes your account, your profile, {projectCount === 1 ? "your project" : `all ${projectCount} of your projects`} with
        every version and uploaded file, your API tokens and linked sign-ins. This can&apos;t be undone.
      </p>
      {!open ? (
        <button onClick={() => setOpen(true)} className="btn-danger mt-4">Delete my account…</button>
      ) : (
        <form onSubmit={remove} className="mt-4 space-y-2">
          <label className="label" htmlFor="confirm-delete">Type <b className="text-text normal-case">{username}</b> to confirm</label>
          <div className="flex flex-wrap gap-2">
            <input id="confirm-delete" className="input min-w-0 flex-1" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <button disabled={busy || confirm !== username} className="btn-danger">{busy ? "Deleting…" : "Delete forever"}</button>
            <button type="button" onClick={() => { setOpen(false); setConfirm(""); }} className="btn-ghost">Cancel</button>
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
        </form>
      )}
    </div>
  );
}
