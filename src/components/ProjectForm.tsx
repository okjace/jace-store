"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PROJECT_TYPES, slugify, typeInfo, type ProjectType } from "@/lib/constants";
import { safeFilename, uploadToBucket } from "@/lib/upload";
import type { Project } from "@/lib/types";
import ProjectIcon from "./ProjectIcon";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const info = typeInfo(type);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const supabase = createClient();
    try {
      const id = project?.id ?? crypto.randomUUID();
      let icon_url = project?.icon_url ?? null;
      if (icon) {
        const ext = icon.name.split(".").pop()?.toLowerCase() || "png";
        icon_url = await uploadToBucket(supabase, "icons", `${userId}/${id}/icon-${Date.now()}.${safeFilename(ext)}`, icon);
      }
      const row = {
        title: title.trim(),
        slug,
        summary: summary.trim(),
        description,
        categories: categories.filter((c) => info.categories.includes(c)),
        source_url: sourceUrl.trim() || null,
        issues_url: issuesUrl.trim() || null,
        license: license.trim() || null,
        icon_url,
      };
      if (editing) {
        const { error } = await supabase.from("projects").update(row).eq("id", id);
        if (error) throw error;
        setSaved(true);
        if (slug !== project.slug) router.replace(`/project/${slug}/edit`);
        router.refresh();
      } else {
        const { error } = await supabase.from("projects").insert({ ...row, id, type, owner_id: userId });
        if (error) throw error.code === "23505" ? new Error("That URL slug is taken — pick another.") : error;
        router.push(`/project/${slug}/edit?new=1#upload`);
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PROJECT_TYPES.map((t) => (
              <button
                type="button"
                key={t.id}
                onClick={() => { setType(t.id); setCategories([]); }}
                className={`rounded-lg border p-3 text-left text-sm ${type === t.id ? "border-brand bg-brand/10" : "border-line bg-panel-2 hover:border-muted"}`}
              >
                <b>{t.label}</b>
              </button>
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
