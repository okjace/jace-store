"use client";
import { useEffect, useState } from "react";
import { formatBytes, timeAgo } from "@/lib/constants";

export interface DlFile { id: string; filename: string; label: string | null; size: number | null; is_primary: boolean; is_external: boolean }
export interface DlVersion { id: string; name: string; version_number: string; release_channel: string; created_at: string; game_versions: string[]; loaders: string[]; files: DlFile[] }

/**
 * The main Download button. In "all" mode it opens a picker with every version
 * instead of downloading one file directly.
 */
export default function DownloadButton({
  mode, file, versions, className = "btn-primary", children = "Download",
}: {
  mode: "latest" | "primary" | "all";
  file: DlFile | null;
  versions: DlVersion[];
  className?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  if (mode !== "all") {
    if (!file) return null;
    return <a href={`/api/download/${file.id}`} className={className}>{children}</a>;
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>{children}</button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="Choose a version">
          <div className="card flex max-h-[85vh] w-full max-w-2xl flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-lg font-bold">Choose a version</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-text" aria-label="Close">✕</button>
            </div>
            <ul className="divide-y divide-line overflow-y-auto">
              {versions.map((v) => (
                <li key={v.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <b>{v.name}</b>
                    <span className="text-sm text-muted">{v.version_number}</span>
                    {v.release_channel !== "release" && <span className="chip">{v.release_channel}</span>}
                    <span className="ml-auto text-xs text-muted">{timeAgo(v.created_at)}</span>
                  </div>
                  {(v.loaders.length > 0 || v.game_versions.length > 0) && (
                    <div className="mt-1 text-xs text-muted capitalize">{[...v.loaders, ...v.game_versions.slice(0, 6)].join(" · ")}</div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {v.files.map((f) => (
                      <a key={f.id} href={`/api/download/${f.id}`} className={`${f.is_primary ? "btn-primary" : "btn-ghost"} px-3! py-1.5! text-xs`}>
                        {f.is_external ? "↗" : "↓"} {f.label || f.filename}{f.size ? ` (${formatBytes(f.size)})` : ""}
                      </a>
                    ))}
                    {v.files.length === 0 && <span className="text-xs text-muted">No files</span>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
