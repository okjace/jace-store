"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** One click: make your Jace Store handle the same as your Jace username. */
export default function UseJaceHandle({ jaceUsername }: { jaceUsername: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: jaceUsername }) });
    const out = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(out.error ?? res.statusText);
    router.refresh();
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button className="btn-ghost" onClick={go} disabled={busy}>{busy ? "Saving…" : `Use @${jaceUsername} as my handle`}</button>
      {error && <span className="text-sm text-red-300">{error}</span>}
    </span>
  );
}
