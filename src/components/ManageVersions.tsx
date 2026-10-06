"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatBytes, formatNumber, timeAgo } from "@/lib/constants";
import type { FileRow, Project, Version } from "@/lib/types";
import VersionEditor from "./VersionEditor";

export default function ManageVersions({ project, versions }: { project: Project; versions: Version[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const isPrimary = (v: Version) => project.download_mode === "primary" && project.primary_version_id === v.id;

  function makePrimary(v: Version) {
    call(`/api/cli/projects/${project.slug}`, { method: "PATCH", body: JSON.stringify({ download_mode: "primary", primary_version_id: v.id }) }, `primary-${v.id}`);
  }

  function labelFile(f: FileRow) {
    const label = prompt("Button label for this file (leave empty to use the filename):", f.label ?? "");
    if (label === null) return;
    call(`/api/cli/files/${f.id}`, { method: "PATCH", body: JSON.stringify({ label }) }, f.id);
  }

  async function removeVersion(v: Version) {
    if (!confirm(`Delete version ${v.version_number}? This can't be undone.`)) return;
    await call(`/api/cli/versions/${v.id}`, { method: "DELETE" }, v.id);
  }

  async function call(url: string, init: RequestInit, key: string) {
    setBusy(key);
    setError(null);
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
    const out = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(out.error ?? res.statusText);
    router.refresh();
  }

  function addLink(v: Version) {
    const url = prompt("Direct download URL for this version:");
    if (!url) return;
    const label = prompt("Button label (optional, e.g. \"Windows\" or \"Mirror\"):") ?? "";
    call(`/api/cli/versions/${v.id}/files`, { method: "POST", body: JSON.stringify({ kind: "link", url, label: label || undefined }) }, `link-${v.id}`);
  }

  async function removeProject() {
    if (prompt(`Type "${project.slug}" to permanently delete this project and all its files.`) !== project.slug) return;
    setBusy("project");
    const res = await fetch(`/api/cli/projects/${project.slug}`, { method: "DELETE" });
    if (!res.ok) {
      setBusy(null);
      return setError((await res.json().catch(() => ({}))).error ?? res.statusText);
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="card overflow-hidden">
        <h2 className="border-b border-line px-6 py-4 text-lg font-bold">Versions ({versions.length})</h2>
        <ul className="divide-y divide-line">
          {versions.map((v) => (
            <li key={v.id} className="px-6 py-3 text-sm">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <b>{v.name}</b> <span className="text-muted">{v.version_number} · {v.release_channel} · {timeAgo(v.created_at)} · {formatNumber(v.downloads)} dl</span>
                  {isPrimary(v) && <span className="chip chip-on ml-2">★ primary</span>}
                </div>
                {!isPrimary(v) && (
                  <button onClick={() => makePrimary(v)} disabled={busy === `primary-${v.id}`} className="btn-ghost px-3! py-1! text-xs" title="Make the Download button always use this version">
                    ★ Make primary
                  </button>
                )}
                <button onClick={() => setEditing(editing === v.id ? null : v.id)} className="btn-ghost px-3! py-1! text-xs">
                  {editing === v.id ? "Close" : "Edit"}
                </button>
                <button onClick={() => addLink(v)} disabled={busy === `link-${v.id}`} className="btn-ghost px-3! py-1! text-xs">
                  {busy === `link-${v.id}` ? "Adding…" : "+ Link"}
                </button>
                <button onClick={() => removeVersion(v)} disabled={busy === v.id} className="btn-danger px-3! py-1! text-xs">Delete</button>
              </div>
              {editing === v.id && (
                <VersionEditor project={project} version={v} onDone={(saved) => { setEditing(null); if (saved) router.refresh(); }} />
              )}
              <ul className="mt-2 space-y-1 pl-3">
                {v.files?.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 text-xs text-muted">
                    <span>{f.is_external ? "↗ link" : "↓ file"}</span>
                    <span className="mr-auto truncate text-text">{f.label ? `${f.label} · ` : ""}{f.filename}</span>
                    {f.size ? <span>{formatBytes(f.size)}</span> : null}
                    {f.is_primary && <span className="chip chip-on">primary</span>}
                    {f.is_external && !f.sha1 && <span className="chip" title="Couldn't download it to verify">unverified</span>}
                    {!f.is_primary && (
                      <button onClick={() => call(`/api/cli/files/${f.id}`, { method: "PATCH", body: JSON.stringify({ primary: true }) }, f.id)}
                        disabled={busy === f.id} className="hover:text-text hover:underline">make primary</button>
                    )}
                    <button onClick={() => labelFile(f)} disabled={busy === f.id} className="hover:text-text hover:underline">label</button>
                    <button onClick={() => confirm(`Remove ${f.filename}?`) && call(`/api/cli/files/${f.id}`, { method: "DELETE" }, f.id)}
                      disabled={busy === f.id} className="text-red-300 hover:underline">remove</button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {versions.length === 0 && <li className="px-6 py-4 text-muted">No versions yet — upload one above.</li>}
        </ul>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <div className="card border-red-500/30 p-6">
        <h2 className="font-bold text-red-300">Danger zone</h2>
        <p className="mt-1 text-sm text-muted">Deleting removes the project, every version and all uploaded files.</p>
        <button onClick={removeProject} disabled={busy === "project"} className="btn-danger mt-3">Delete project</button>
      </div>
    </div>
  );
}
