"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReportActions({ reportId, projectTitle, comment = false }: { reportId: string; projectTitle: string; comment?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "dismiss" | "resolve" | "remove_project" | "remove_comment") {
    if (action === "remove_project" && prompt(`Type REMOVE to permanently delete "${projectTitle}" and all its files.`) !== "REMOVE") return;
    if (action === "remove_comment" && !confirm("Remove this comment (and its replies)?")) return;
    const note = action.startsWith("remove_") ? undefined : prompt("Note (optional, only moderators see it):") ?? undefined;
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
      {comment
        ? <button disabled={busy} onClick={() => act("remove_comment")} className="btn-danger px-3! py-1! text-xs">Remove comment</button>
        : <button disabled={busy} onClick={() => act("remove_project")} className="btn-danger px-3! py-1! text-xs">Remove project</button>}
      {error && <span className="text-xs text-red-300">{error}</span>}
    </div>
  );
}
