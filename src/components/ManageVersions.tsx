"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatNumber, timeAgo } from "@/lib/constants";
import type { Project, Version } from "@/lib/types";

export default function ManageVersions({ project, versions }: { project: Project; versions: Version[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function removeVersion(v: Version) {
    if (!confirm(`Delete version ${v.version_number}? This can't be undone.`)) return;
    setBusy(v.id);
    const supabase = createClient();
    const paths = v.files?.map((f) => f.storage_path) ?? [];
    const { error } = await supabase.from("versions").delete().eq("id", v.id);
    if (!error && paths.length) await supabase.storage.from("project-files").remove(paths);
    setBusy(null);
    if (error) return setError(error.message);
    router.refresh();
  }

  async function removeProject() {
    if (prompt(`Type "${project.slug}" to permanently delete this project and all its files.`) !== project.slug) return;
    setBusy("project");
    const supabase = createClient();
    const paths = versions.flatMap((v) => v.files?.map((f) => f.storage_path) ?? []);
    const { error } = await supabase.from("projects").delete().eq("id", project.id);
    if (error) { setBusy(null); return setError(error.message); }
    if (paths.length) await supabase.storage.from("project-files").remove(paths);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="card overflow-hidden">
        <h2 className="border-b border-line px-6 py-4 text-lg font-bold">Versions ({versions.length})</h2>
        <ul className="divide-y divide-line">
          {versions.map((v) => (
            <li key={v.id} className="flex items-center gap-3 px-6 py-3 text-sm">
              <div className="flex-1">
                <b>{v.name}</b> <span className="text-muted">{v.version_number} · {v.release_channel} · {timeAgo(v.created_at)} · {formatNumber(v.downloads)} dl</span>
              </div>
              <button onClick={() => removeVersion(v)} disabled={busy === v.id} className="btn-danger px-3! py-1! text-xs">Delete</button>
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
