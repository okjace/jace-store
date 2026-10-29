"use client";
import { useEffect, useState } from "react";
import { REPORT_REASONS } from "@/lib/moderation-reasons";

export default function ReportButton({ projectId, projectTitle, signedIn, loginHref, commentId, label = "⚑ Report" }: {
  projectId: string; projectTitle: string; signedIn: boolean; loginHref: string;
  /** Report a comment on the project instead of the project itself. */
  commentId?: string; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, reason, details, ...(commentId ? { comment_id: commentId } : {}) }),
    });
    const out = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(out.error ?? res.statusText);
    setSent(true);
  }

  if (!signedIn) {
    return <a href={loginHref} className="text-xs text-muted hover:text-red-300 hover:underline">{label}</a>;
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-muted hover:text-red-300 hover:underline">{label}</button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="Report project">
          <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            {sent ? (
              <div className="space-y-3 text-center">
                <h2 className="text-lg font-bold">Thanks for the report</h2>
                <p className="text-sm text-muted">A moderator will review {commentId ? "this comment" : <b>{projectTitle}</b>}.</p>
                <button onClick={() => setOpen(false)} className="btn-primary">Close</button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div className="flex items-start justify-between">
                  <h2 className="text-lg font-bold">{commentId ? "Report comment" : `Report ${projectTitle}`}</h2>
                  <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-text" aria-label="Close">✕</button>
                </div>
                <fieldset className="space-y-2">
                  <legend className="label">What&apos;s wrong?</legend>
                  {REPORT_REASONS.map((r) => (
                    <label key={r.id} className={`block cursor-pointer rounded-lg border p-3 text-sm ${reason === r.id ? "border-red-400/60 bg-red-500/10" : "border-line bg-panel-2 hover:border-muted"}`}>
                      <input type="radio" name="reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} className="sr-only" />
                      <b>{r.label}</b>
                      <span className="block text-xs text-muted">{r.hint}</span>
                    </label>
                  ))}
                </fieldset>
                <div>
                  <label className="label" htmlFor="report-details">Details {reason === "other" ? "(required)" : "(optional)"}</label>
                  <textarea id="report-details" rows={3} maxLength={2000} className="input" value={details} onChange={(e) => setDetails(e.target.value)}
                    placeholder="Links, which version, what happened…" />
                </div>
                {error && <p className="text-sm text-red-300">{error}</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setOpen(false)} className="btn-ghost">Cancel</button>
                  <button disabled={busy || !reason} className="btn-danger">{busy ? "Sending…" : "Send report"}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
