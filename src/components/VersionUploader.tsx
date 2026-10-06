"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GAME_VERSIONS, formatBytes, typeInfo } from "@/lib/constants";
import { detectMeta, hashFile, safeFilename, uploadToBucket } from "@/lib/upload";
import type { Project } from "@/lib/types";

const MAX_BYTES = 500 * 1024 * 1024;

export default function VersionUploader({ project, userId }: { project: Project; userId: string }) {
  const router = useRouter();
  const info = typeInfo(project.type);
  const [files, setFiles] = useState<File[]>([]);
  const [versionNumber, setVersionNumber] = useState("");
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<"release" | "beta" | "alpha">("release");
  const [loaders, setLoaders] = useState<string[]>([]);
  const [gameVersions, setGameVersions] = useState<string[]>([]);
  const [changelog, setChangelog] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pickFiles(list: FileList | null) {
    const picked = [...(list ?? [])];
    const tooBig = picked.find((f) => f.size > MAX_BYTES);
    if (tooBig) return setError(`${tooBig.name} is larger than 500 MB.`);
    setError(null);
    setFiles(picked);
    if (picked[0]) {
      const meta = await detectMeta(picked[0]);
      if (meta.versionNumber && !versionNumber) setVersionNumber(meta.versionNumber);
      if (meta.name && !name) setName(meta.name);
      if (meta.loaders?.length && !loaders.length) setLoaders(meta.loaders.filter((l) => info.loaders.includes(l)));
      if (meta.gameVersions?.length && !gameVersions.length) setGameVersions(meta.gameVersions);
    }
  }

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length) return setError("Pick at least one file.");
    if (info.minecraft && !gameVersions.length) return setError("Select at least one Minecraft version.");
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const uploadedPaths: string[] = [];
    let versionId: string | null = null;
    try {
      const vid = crypto.randomUUID();
      const fileRows = [];
      for (const [i, f] of files.entries()) {
        setStatus(`Hashing ${f.name}…`);
        const { sha1, sha512 } = await hashFile(f);
        setStatus(`Uploading ${f.name} (${formatBytes(f.size)})…`);
        const path = `${userId}/${project.id}/${vid}/${safeFilename(f.name)}`;
        const url = await uploadToBucket(supabase, "project-files", path, f);
        uploadedPaths.push(path);
        fileRows.push({ version_id: vid, filename: f.name, storage_path: path, url, size: f.size, sha1, sha512, is_primary: i === 0 });
      }
      setStatus("Saving version…");
      const { error: vErr } = await supabase.from("versions").insert({
        id: vid,
        project_id: project.id,
        version_number: versionNumber.trim(),
        name: name.trim() || versionNumber.trim(),
        release_channel: channel,
        loaders,
        game_versions: gameVersions,
        changelog,
      });
      if (vErr) throw vErr.code === "23505" ? new Error("A version with that number already exists.") : vErr;
      versionId = vid;
      const { error: fErr } = await supabase.from("files").insert(fileRows);
      if (fErr) throw fErr;

      setFiles([]); setVersionNumber(""); setName(""); setChangelog("");
      setStatus("Published!");
      router.refresh();
    } catch (err) {
      // Roll back partial uploads so we don't leave orphans behind.
      if (versionId) await supabase.from("versions").delete().eq("id", versionId);
      if (uploadedPaths.length) await supabase.storage.from("project-files").remove(uploadedPaths);
      setStatus(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="upload" onSubmit={submit} className="card space-y-5 p-6">
      <h2 className="text-lg font-bold">Upload a new version</h2>

      <label className="block cursor-pointer rounded-xl border-2 border-dashed border-line p-6 text-center hover:border-brand">
        <input type="file" multiple accept={info.accept === "*" ? undefined : info.accept} className="hidden" onChange={(e) => pickFiles(e.target.files)} />
        {files.length ? (
          <div className="space-y-1 text-sm">
            {files.map((f, i) => (
              <div key={f.name}>{i === 0 && <span className="chip chip-on mr-2">primary</span>}{f.name} <span className="text-muted">({formatBytes(f.size)})</span></div>
            ))}
          </div>
        ) : (
          <div className="text-muted">
            Click to choose {info.accept === "*" ? "files" : info.accept} (max 500 MB). The first file is the primary download.
          </div>
        )}
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="vnum">Version number</label>
          <input id="vnum" required maxLength={64} value={versionNumber} onChange={(e) => setVersionNumber(e.target.value)} className="input" placeholder="1.0.0" />
        </div>
        <div>
          <label className="label" htmlFor="vname">Display name</label>
          <input id="vname" value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Optional" />
        </div>
        <div>
          <label className="label" htmlFor="chan">Channel</label>
          <select id="chan" value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)} className="input">
            <option value="release">Release</option>
            <option value="beta">Beta</option>
            <option value="alpha">Alpha</option>
          </select>
        </div>
      </div>

      <div>
        <span className="label">{info.loaderLabel}</span>
        <div className="flex flex-wrap gap-1.5">
          {info.loaders.map((l) => (
            <button type="button" key={l} onClick={() => toggle(loaders, setLoaders, l)}
              className={`chip cursor-pointer capitalize ${loaders.includes(l) ? "chip-on" : "hover:text-text"}`}>{l}</button>
          ))}
        </div>
      </div>

      {info.minecraft && (
        <div>
          <span className="label">Minecraft versions</span>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {GAME_VERSIONS.map((v) => (
              <button type="button" key={v} onClick={() => toggle(gameVersions, setGameVersions, v)}
                className={`chip cursor-pointer ${gameVersions.includes(v) ? "chip-on" : "hover:text-text"}`}>{v}</button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="label" htmlFor="cl">Changelog (Markdown)</label>
        <textarea id="cl" rows={5} value={changelog} onChange={(e) => setChangelog(e.target.value)} className="input font-mono" />
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}
      {status && <p className="text-sm text-brand">{status}</p>}
      <button disabled={busy} className="btn-primary">{busy ? "Working…" : "Publish version"}</button>
    </form>
  );
}
