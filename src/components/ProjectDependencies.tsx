"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEP_TYPES, linkedProject, SOURCE_LABELS, type AutoDependency, type Dependency } from "@/lib/dependencyTypes";
import type { Project, Version } from "@/lib/types";
import { TYPE_LABELS } from "./DependencyPicker";

type Row = { source: AutoDependency["source"]; project: string; type: AutoDependency["type"] };

/**
 * Dependencies for every version: add a Modrinth or CurseForge mod once, and every version (now
 * and later) gets the release of it that fits its Minecraft versions and loaders.
 */
export default function ProjectDependencies({ project, versions }: { project: Project; versions: Version[] }) {
  const router = useRouter();
  const saved = project.auto_dependencies ?? [];
  const [rows, setRows] = useState<Row[]>(saved.map(({ source, project, type }) => ({ source, project, type })));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const changed = JSON.stringify(rows.filter((r) => r.project.trim())) !== JSON.stringify(saved.map(({ source, project, type }) => ({ source, project, type })));

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/cli/projects/${project.slug}/dependencies`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dependencies: rows.filter((r) => r.project.trim()) }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error ?? res.statusText);
      const missing = (out.versions as { dependencies: { version: string | null }[] }[])
        .reduce((n, v) => n + v.dependencies.filter((d) => !d.version).length, 0);
      setMsg({ ok: true, text: `Saved and matched for ${out.versions.length} version${out.versions.length === 1 ? "" : "s"}.${missing ? ` ${missing} had no matching release (they still list the mod).` : ""}` });
      setRows((out.dependencies as AutoDependency[]).map(({ source, project, type }) => ({ source, project, type })));
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-4 p-6">
      <div>
        <h2 className="text-lg font-bold">Dependencies for every version</h2>
        <p className="mt-1 text-sm text-muted">
          Add a Modrinth or CurseForge mod once. Every version, including ones you upload later, gets the release of it
          that fits that version&apos;s Minecraft versions and loaders, and launchers install that exact release. Use the
          mod&apos;s slug (e.g. <code>fabric-api</code>) or paste its link.
        </p>
      </div>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select aria-label="Where it's hosted" className="input w-auto!" value={r.source}
              onChange={(e) => set(i, { source: e.target.value as Row["source"] })}>
              <option value="modrinth">Modrinth</option>
              <option value="curseforge">CurseForge</option>
            </select>
            <input aria-label="Mod slug or link" className="input min-w-40 flex-1" placeholder="mod-slug or link" maxLength={200}
              value={r.project}
              onChange={(e) => {
                const v = e.target.value.trim();
                const linked = linkedProject(v);
                set(i, linked ?? { project: v.toLowerCase() });
              }} />
            <select aria-label="Dependency type" className="input w-auto!" value={r.type}
              onChange={(e) => set(i, { type: e.target.value as Row["type"] })}>
              {DEP_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
            <button type="button" className="btn-ghost px-2! py-1! text-xs" aria-label="Remove"
              onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost px-3! py-1.5! text-xs" disabled={rows.length >= 20}
          onClick={() => setRows([...rows, { source: "modrinth", project: "", type: "required" }])}>
          + Add mod
        </button>
        <button type="button" className="btn-primary" disabled={busy || (!changed && !saved.length)} onClick={save}>
          {busy ? "Matching releases…" : changed ? "Save and apply to all versions" : "Check for newer releases"}
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-brand" : "text-red-300"}`}>{msg.text}</span>}
      </div>

      {saved.length > 0 && versions.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1 pr-3 font-medium">Version</th>
                {saved.map((d) => <th key={d.source + d.project_id} className="py-1 pr-3 font-medium">{d.title} <span className="text-muted">({SOURCE_LABELS[d.source]})</span></th>)}
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id} className="border-t border-line">
                  <td className="py-1.5 pr-3 font-medium">{v.version_number} <span className="text-xs text-muted">{v.game_versions.slice(0, 3).join(", ")}</span></td>
                  {saved.map((d) => {
                    const got = (v.dependencies ?? []).find((x: Dependency) => x.auto && x.source === d.source && x.project_id === d.project_id);
                    return (
                      <td key={d.source + d.project_id} className="py-1.5 pr-3">
                        {got?.version_name ?? <span className="text-amber-300">{got ? "no matching release" : "not matched yet"}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
