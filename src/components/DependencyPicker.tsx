"use client";
import { useEffect, useState } from "react";
import { DEP_TYPES, type Dependency } from "@/lib/dependencyTypes";

const SOURCES: { id: Dependency["source"]; label: string }[] = [
  { id: "modrinth", label: "Modrinth" },
  { id: "jace", label: "Jace Store" },
];
const TYPE_LABELS: Record<Dependency["type"], string> = {
  required: "Required",
  optional: "Optional",
  incompatible: "Incompatible",
  embedded: "Embedded",
};

/** Edit a version's dependencies: other projects (on Jace Store or Modrinth) it needs. */
export default function DependencyPicker({
  value, onChange, idPrefix,
}: {
  value: Dependency[];
  onChange: (deps: Dependency[]) => void;
  idPrefix: string;
}) {
  const set = (i: number, patch: Partial<Dependency>) => onChange(value.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  return (
    <div>
      <span className="label">Dependencies</span>
      <p className="mb-2 text-xs text-muted">
        Other projects this version needs. Launchers install required ones automatically. Use the project&apos;s slug, the
        last part of its link (e.g. <code>fabric-api</code> from modrinth.com/mod/fabric-api).
      </p>
      <div className="space-y-2">
        {value.map((d, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select aria-label="Where it's hosted" className="input w-auto!" value={d.source}
              onChange={(e) => set(i, { source: e.target.value as Dependency["source"] })}>
              {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <input id={`${idPrefix}-dep-${i}`} aria-label="Project slug" className="input min-w-40 flex-1" placeholder="project-slug"
              value={d.project} maxLength={64}
              onChange={(e) => set(i, { project: e.target.value.trim().toLowerCase() })} />
            <select aria-label="Dependency type" className="input w-auto!" value={d.type}
              onChange={(e) => set(i, { type: e.target.value as Dependency["type"] })}>
              {DEP_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
            <Lookup dep={d} />
            <button type="button" className="btn-ghost px-2! py-1! text-xs" aria-label="Remove dependency"
              onClick={() => onChange(value.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
      </div>
      <button type="button" className="btn-ghost mt-2 px-3! py-1.5! text-xs"
        onClick={() => onChange([...value, { source: "modrinth", project: "", type: "required" }])}>
        + Add dependency
      </button>
    </div>
  );
}

/** Shows the project's real name once the slug is found (or that it wasn't). */
function Lookup({ dep }: { dep: Dependency }) {
  const [state, setState] = useState<{ key: string; title: string | null } | null>(null);
  const key = `${dep.source}:${dep.project}`;
  useEffect(() => {
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(dep.project)) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const url = dep.source === "modrinth"
        ? `https://api.modrinth.com/v2/project/${encodeURIComponent(dep.project)}`
        : `/api/launcher/v1/project/${encodeURIComponent(dep.project)}`;
      try {
        const r = await fetch(url, { signal: ctrl.signal });
        const d = r.ok ? await r.json() : null;
        setState({ key, title: d?.title ?? null });
      } catch {
        // aborted or offline: show nothing
      }
    }, 400);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [dep.source, dep.project, key]);
  if (!dep.project || state?.key !== key) return null;
  return state.title
    ? <span className="text-xs text-brand">✓ {state.title}</span>
    : <span className="text-xs text-red-300">Not found</span>;
}

/** Drop empty rows before saving. */
export const cleanDeps = (deps: Dependency[]) => deps.filter((d) => d.project.trim());
