"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GROUPS, slugify, typeInfo, typesInGroup, type ProjectType } from "@/lib/constants";
import { safeFilename, uploadToBucket } from "@/lib/upload";
import type { Project } from "@/lib/types";
import ProjectIcon from "./ProjectIcon";

const MAX_SHOTS = 8;

export default function ProjectForm({ project, userId }: { project?: Project; userId: string }) {
  const router = useRouter();
  const editing = !!project;
  const [type, setType] = useState<ProjectType>(project?.type ?? "mod");
  const [title, setTitle] = useState(project?.title ?? "");
  const [slug, setSlug] = useState(project?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(editing);
  const [summary, setSummary] = useState(project?.summary ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [categories, setCategories] = useState<string[]>(project?.categories ?? []);
  const [sourceUrl, setSourceUrl] = useState(project?.source_url ?? "");
  const [issuesUrl, setIssuesUrl] = useState(project?.issues_url ?? "");
  const [license, setLicense] = useState(project?.license ?? "");
  const [icon, setIcon] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(project?.icon_url ?? null);
  const [gallery, setGallery] = useState<string[]>(project?.gallery ?? []);
  const [newShots, setNewShots] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const info = typeInfo(type);

  async function api(url: string, method: string, body: unknown) {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error ?? res.statusText);
    return out;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const supabase = createClient();
    try {
      const fields = {
        title: title.trim(),
        summary: summary.trim(),
        description,
        categories: categories.filter((c) => info.categories.includes(c)),
        source_url: sourceUrl.trim() || null,
        issues_url: issuesUrl.trim() || null,
        license: license.trim() || null,
      };
      // everything goes through the server, which applies Jace's moderation
      const current: { id: string; slug: string } = project ?? await api("/api/cli/projects", "POST", { ...fields, type, slug });
      const id = current.id;
      let icon_url = project?.icon_url ?? null;
      if (icon) {
        const ext = icon.name.split(".").pop()?.toLowerCase() || "png";
        icon_url = await uploadToBucket(supabase, "icons", `${userId}/${id}/icon-${Date.now()}.${safeFilename(ext)}`, icon);
      }
      const uploaded: string[] = [];
      for (const [i, shot] of newShots.entries()) {
        const ext = shot.name.split(".").pop()?.toLowerCase() || "png";
        uploaded.push(await uploadToBucket(supabase, "icons", `${userId}/${id}/gallery-${Date.now()}-${i}.${safeFilename(ext)}`, shot));
      }
      const nextGallery = [...gallery, ...uploaded].slice(0, MAX_SHOTS);
      if (editing) {
        await api(`/api/cli/projects/${project.slug}`, "PATCH", { ...fields, slug, icon_url, gallery: nextGallery });
        setSaved(true);
        setGallery(nextGallery);
        setNewShots([]);
        if (slug !== project.slug) router.replace(`/project/${slug}/edit`);
        router.refresh();
      } else {
        if (icon_url || nextGallery.length) {
          await api(`/api/cli/projects/${current.slug}`, "PATCH", { icon_url, gallery: nextGallery });
        }
        router.push(`/project/${current.slug}/edit?new=1#upload`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }


  return (
    <form onSubmit={submit} className="card space-y-5 p-6">
      {!editing && (
        <div>
          <span className="label">What are you uploading?</span>
          <div className="space-y-3">
            {GROUPS.map((g) => (
              <div key={g.id}>
                <div className="mb-1.5 text-xs text-muted">{g.label}</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {typesInGroup(g.id).map((t) => (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => { setType(t.id); setCategories([]); }}
                      className={`flex items-center gap-2 rounded-lg border p-2.5 text-left text-sm ${type === t.id ? "border-brand bg-brand/10" : "border-line bg-panel-2 hover:border-muted"}`}
                    >
                      <span aria-hidden>{t.icon}</span><b>{t.label}</b>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-start gap-4">
        <ProjectIcon url={iconPreview} title={title || "?"} type={type} size={80} />
        <div className="flex-1">
          <label className="label" htmlFor="icon">Icon (PNG/JPG/WebP, max 2 MB)</label>
          <input
            id="icon"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (f && f.size > 2 * 1024 * 1024) { setError("Icon must be under 2 MB"); return; }
              setIcon(f);
              setIconPreview(f ? URL.createObjectURL(f) : project?.icon_url ?? null);
            }}
            className="text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-panel-2 file:px-3 file:py-1.5 file:text-text"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="title">Name</label>
          <input id="title" required minLength={2} maxLength={80} value={title} className="input"
            onChange={(e) => { setTitle(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} />
        </div>
        <div>
          <label className="label" htmlFor="slug">URL</label>
          <div className="flex items-center gap-1 text-sm text-muted">
            /project/
            <input id="slug" required pattern="[a-z0-9][a-z0-9_-]{1,63}" value={slug} className="input"
              onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }} />
          </div>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="summary">Summary</label>
        <input id="summary" required minLength={3} maxLength={256} value={summary} onChange={(e) => setSummary(e.target.value)} className="input" placeholder="One line about what this does" />
      </div>

      <div>
        <span className="label">Categories</span>
        <div className="flex flex-wrap gap-1.5">
          {info.categories.map((c) => {
            const on = categories.includes(c);
            return (
              <button type="button" key={c} className={`chip cursor-pointer ${on ? "chip-on" : "hover:text-text"}`}
                onClick={() => setCategories(on ? categories.filter((x) => x !== c) : [...categories, c])}>
                {c}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="label" htmlFor="desc">Description (Markdown)</label>
        <textarea id="desc" rows={12} value={description} onChange={(e) => setDescription(e.target.value)} className="input font-mono" placeholder="# Features&#10;- ..." />
      </div>

      <div>
        <span className="label">Screenshots / previews (up to {MAX_SHOTS}, 10 MB each)</span>
        <div className="flex flex-wrap gap-2">
          {gallery.map((src) => (
            <div key={src} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-24 w-36 rounded-lg border border-line object-cover" />
              <button type="button" onClick={() => setGallery(gallery.filter((g) => g !== src))}
                className="absolute top-1 right-1 rounded bg-black/70 px-1.5 text-xs" aria-label="Remove screenshot">✕</button>
            </div>
          ))}
          {newShots.map((f, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={URL.createObjectURL(f)} alt="" className="h-24 w-36 rounded-lg border border-brand/50 object-cover" />
              <button type="button" onClick={() => setNewShots(newShots.filter((_, j) => j !== i))}
                className="absolute top-1 right-1 rounded bg-black/70 px-1.5 text-xs" aria-label="Remove screenshot">✕</button>
            </div>
          ))}
          {gallery.length + newShots.length < MAX_SHOTS && (
            <label className="grid h-24 w-36 cursor-pointer place-items-center rounded-lg border-2 border-dashed border-line text-sm text-muted hover:border-brand">
              + Add
              <input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
                onChange={(e) => {
                  const picked = [...(e.target.files ?? [])];
                  const big = picked.find((f) => f.size > 10 * 1024 * 1024);
                  if (big) return setError(`${big.name} is over 10 MB`);
                  setNewShots([...newShots, ...picked].slice(0, MAX_SHOTS - gallery.length));
                  e.target.value = "";
                }} />
            </label>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="src">Source code URL</label>
          <input id="src" type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} className="input" placeholder="https://github.com/…" />
        </div>
        <div>
          <label className="label" htmlFor="issues">Issues URL</label>
          <input id="issues" type="url" value={issuesUrl} onChange={(e) => setIssuesUrl(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="license">License</label>
          <input id="license" value={license} onChange={(e) => setLicense(e.target.value)} className="input" placeholder="MIT, ARR, …" />
        </div>
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}
      {saved && <p className="text-sm text-brand">Saved.</p>}
      <button disabled={busy} className="btn-primary">{busy ? "Saving…" : editing ? "Save changes" : "Create project"}</button>
    </form>
  );
}
