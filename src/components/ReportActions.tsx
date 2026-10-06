"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReportActions({ reportId, projectTitle }: { reportId: string; projectTitle: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "dismiss" | "resolve" | "remove_project") {
    if (action === "remove_project" && prompt(`Type REMOVE to permanently delete "${projectTitle}" and all its files.`) !== "REMOVE") return;
    const note = action === "remove_project" ? undefined : prompt("Note (optional, only moderators see it):") ?? undefined;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/reports/${reportId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    const out = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(out.error ?? res.statusText);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button disabled={busy} onClick={() => act("dismiss")} className="btn-ghost px-3! py-1! text-xs" title="Nothing wrong: close the report(s)">Dismiss</button>
      <button disabled={busy} onClick={() => act("resolve")} className="btn-ghost px-3! py-1! text-xs" title="Handled another way (e.g. the creator fixed it)">Mark resolved</button>
      <button disabled={busy} onClick={() => act("remove_project")} className="btn-danger px-3! py-1! text-xs">Remove project</button>
      {error && <span className="text-xs text-red-300">{error}</span>}
    </div>
  );
}
