"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Project, Version } from "@/lib/types";

const MODES = [
  { id: "latest", title: "Newest version", body: "Download gets the most recently published version." },
  { id: "primary", title: "Primary version", body: "Download always gets the version you pick, even after newer ones are published." },
  { id: "all", title: "Show all versions", body: "Download opens a list of every version so people choose." },
] as const;

export default function DownloadSettings({ project, versions }: { project: Project; versions: Version[] }) {
  const router = useRouter();
  const [mode, setMode] = useState(project.download_mode ?? "latest");
  const [primary, setPrimary] = useState(project.primary_version_id ?? versions[0]?.id ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setMsg(null);
    const body: Record<string, unknown> = { download_mode: mode };
    if (mode === "primary") body.primary_version_id = primary;
    const res = await fetch(`/api/cli/projects/${project.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const out = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: out.error ?? res.statusText });
    if (res.ok) router.refresh();
  }

  return (
    <div className="card space-y-4 p-6">
      <h2 className="text-lg font-bold">Download button</h2>
      <div className="grid gap-2 sm:grid-cols-3">
        {MODES.map((m) => (
          <label key={m.id} className={`cursor-pointer rounded-lg border p-3 text-sm ${mode === m.id ? "border-brand bg-brand/10" : "border-line bg-panel-2 hover:border-muted"}`}>
            <input type="radio" name="dlmode" value={m.id} checked={mode === m.id} onChange={() => setMode(m.id)} className="sr-only" />
            <b>{m.title}</b>
            <p className="mt-1 text-xs text-muted">{m.body}</p>
          </label>
        ))}
      </div>
      {mode === "primary" && (
        <div>
          <label className="label" htmlFor="primary-version">Primary version</label>
          <select id="primary-version" className="input" value={primary} onChange={(e) => setPrimary(e.target.value)}>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>{v.name} ({v.version_number}, {v.release_channel})</option>
            ))}
          </select>
          {versions.length === 0 && <p className="mt-1 text-xs text-amber-300">Upload a version first.</p>}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy || (mode === "primary" && !primary)} className="btn-primary">{busy ? "Saving…" : "Save"}</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-brand" : "text-red-300"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
