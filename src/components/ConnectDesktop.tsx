"use client";
import { useState } from "react";

export default function ConnectDesktop({ port, state, username }: { port: number; state: string; username: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function connect() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/desktop/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      return setError(out.error ?? res.statusText);
    }
    setDone(true);
    // hand the session to the app, which is listening on this computer only (127.0.0.1)
    window.location.href = `http://127.0.0.1:${port}/callback?state=${state}&token=${encodeURIComponent(out.token)}`;
  }

  if (done) return <p className="text-sm text-brand">Connected. You can go back to the Jace Store app.</p>;
  return (
    <>
      <p className="text-sm text-muted">The Jace Store app on this computer will be signed in as <b className="text-text">@{username}</b>.</p>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <button className="btn-primary w-full" onClick={connect} disabled={busy}>{busy ? "Connecting…" : "Connect"}</button>
      <p className="text-xs text-muted">Only click this if you just clicked Sign in in the Jace Store app.</p>
    </>
  );
}
