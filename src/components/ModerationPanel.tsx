"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ModState } from "@/lib/accountModeration";

const fmt = (t: string | null) => (t ? new Date(t).toLocaleString() : "for good");
const ban = (s: ModState) => !!s.banned_at && (!s.ban_until || new Date(s.ban_until) > new Date());
const mute = (s: ModState) => !!s.muted_at && (!s.mute_until || new Date(s.mute_until) > new Date());

/** Moderators only: ban / mute this account on Jace Store, or lift it. */
export default function ModerationPanel({ userId, username, state }: { userId: string; username: string; state: ModState }) {
  const router = useRouter();
  const [s, setS] = useState(state);
  const [duration, setDuration] = useState("1d");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: string) {
    if ((action === "ban" || action === "mute") && !confirm(`${action === "ban" ? "Ban" : "Mute"} @${username} (${duration})?`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/users/${userId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, duration, reason }) });
    const out = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(out.error ?? res.statusText);
    if (out) setS(out);
    router.refresh();
  }

  return (
    <section className="card border-amber-300/30 p-5 text-sm">
      <h2 className="font-bold text-amber-200">Moderation</h2>
      <div className="mt-2 space-y-1 text-muted">
        <div>Ban: {ban(s) ? <b className="text-red-300">banned {fmt(s.ban_until)}{s.ban_reason ? `: ${s.ban_reason}` : ""} ({s.ban_from})</b> : "none"}</div>
        <div>Mute: {mute(s) ? <b className="text-amber-200">muted {fmt(s.mute_until)}{s.mute_reason ? `: ${s.mute_reason}` : ""} ({s.mute_from})</b> : "none"}</div>
        {(s.ban_from === "jace" || s.mute_from === "jace") && (
          <div>Restrictions from Jace follow the Jace account: lift them on Jace (lifting them here doesn&apos;t last).</div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select className="input w-auto!" value={duration} onChange={(e) => setDuration(e.target.value)}>
          {[["1h", "1 hour"], ["1d", "1 day"], ["3d", "3 days"], ["1w", "1 week"], ["30d", "30 days"], ["forever", "For good"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input className="input min-w-0 flex-1" placeholder="Reason (shown to them)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={400} />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {mute(s) ? <button className="btn-ghost" disabled={busy} onClick={() => act("unmute")}>Unmute</button>
          : <button className="btn-ghost" disabled={busy} onClick={() => act("mute")}>Mute</button>}
        {ban(s) ? <button className="btn-ghost" disabled={busy} onClick={() => act("unban")}>Unban</button>
          : <button className="btn-danger" disabled={busy} onClick={() => act("ban")}>Ban</button>}
        <button className="btn-ghost" disabled={busy} onClick={() => act("sync")} title="Check the linked Jace account now">Check Jace now</button>
      </div>
      {error && <p className="mt-2 text-red-300">{error}</p>}
    </section>
  );
}
