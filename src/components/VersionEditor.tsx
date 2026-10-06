"use client";
import { useState } from "react";
import { GAME_VERSIONS, typeInfo } from "@/lib/constants";
import type { Project, Version } from "@/lib/types";

/** Inline form to change a published version's details. */
export default function VersionEditor({
  project, version, onDone,
}: {
  project: Project;
  version: Version;
  onDone: (saved: boolean) => void;
}) {
  const info = typeInfo(project.type);
  const [name, setName] = useState(version.name);
  const [number, setNumber] = useState(version.version_number);
  const [channel, setChannel] = useState(version.release_channel);
  const [loaders, setLoaders] = useState(version.loaders);
  const [gameVersions, setGameVersions] = useState(version.game_versions);
  const [changelog, setChangelog] = useState(version.changelog);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  // Keep any values that aren't in the preset lists (e.g. set via the CLI).
  const loaderOptions = [...new Set([...info.loaders, ...version.loaders])];
  const versionOptions = [...new Set([...GAME_VERSIONS, ...version.game_versions])];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (info.minecraft && !gameVersions.length) return setError("Select at least one Minecraft version.");
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/cli/versions/${version.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, version_number: number, channel, loaders, game_versions: gameVersions, changelog }),
    });
    const out = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(out.error ?? res.statusText);
    onDone(true);
  }

  return (
    <form onSubmit={save} className="mt-3 space-y-3 rounded-lg border border-line bg-panel-2/50 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor={`n-${version.id}`}>Display name</label>
          <input id={`n-${version.id}`} className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor={`v-${version.id}`}>Version number</label>
          <input id={`v-${version.id}`} className="input" value={number} onChange={(e) => setNumber(e.target.value)} required maxLength={64} />
        </div>
        <div>
          <label className="label" htmlFor={`c-${version.id}`}>Channel</label>
          <select id={`c-${version.id}`} className="input" value={channel} onChange={(e) => setChannel(e.target.value as Version["release_channel"])}>
            <option value="release">Release</option>
            <option value="beta">Beta</option>
            <option value="alpha">Alpha</option>
          </select>
        </div>
      </div>
      <div>
        <span className="label">{info.loaderLabel}</span>
        <div className="flex flex-wrap gap-1.5">
          {loaderOptions.map((l) => (
            <button type="button" key={l} onClick={() => toggle(loaders, setLoaders, l)}
              className={`chip cursor-pointer capitalize ${loaders.includes(l) ? "chip-on" : "hover:text-text"}`}>{l}</button>
          ))}
        </div>
      </div>
      {info.minecraft && (
        <div>
          <span className="label">Minecraft versions</span>
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
            {versionOptions.map((v) => (
              <button type="button" key={v} onClick={() => toggle(gameVersions, setGameVersions, v)}
                className={`chip cursor-pointer ${gameVersions.includes(v) ? "chip-on" : "hover:text-text"}`}>{v}</button>
            ))}
          </div>
        </div>
      )}
      <div>
        <label className="label" htmlFor={`cl-${version.id}`}>Changelog (Markdown)</label>
        <textarea id={`cl-${version.id}`} rows={4} className="input font-mono" value={changelog} onChange={(e) => setChangelog(e.target.value)} />
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy} className="btn-primary">{busy ? "Saving…" : "Save version"}</button>
        <button type="button" onClick={() => onDone(false)} className="btn-ghost">Cancel</button>
      </div>
    </form>
  );
}
