import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatBytes, formatNumber, siteUrl, timeAgo, typeInfo } from "@/lib/constants";
import type { Project, Version } from "@/lib/types";
import Markdown from "@/components/Markdown";
import ProjectIcon from "@/components/ProjectIcon";
import InstallPanel from "@/components/InstallPanel";
import AddToPackButton from "@/components/AddToPackButton";

const PACKABLE = ["mod", "resourcepack", "shader"];

async function load(slug: string) {
  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("*, owner:profiles(username, display_name, avatar_url)")
    .eq("slug", slug)
    .maybeSingle();
  if (!project) return null;
  const [{ data: versions }, { data: auth }] = await Promise.all([
    supabase.from("versions").select("*, files(*)").eq("project_id", project.id).order("created_at", { ascending: false }),
    supabase.auth.getUser(),
  ]);
  return {
    project: project as Project,
    versions: (versions ?? []) as Version[],
    isOwner: auth.user?.id === project.owner_id,
  };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const data = await load((await params).slug);
  return data ? { title: data.project.title, description: data.project.summary } : {};
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const data = await load((await params).slug);
  if (!data) notFound();
  const { project, versions, isOwner } = data;
  const info = typeInfo(project.type);
  const latest = versions[0];
  const latestFile = latest?.files?.find((f) => f.is_primary) ?? latest?.files?.[0];

  return (
    <div className="space-y-6">
      <header className="card flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
        <ProjectIcon url={project.icon_url} title={project.title} type={project.type} size={96} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-black">{project.title}</h1>
            <Link href={`/browse?type=${info.id}`} className="chip chip-on">{info.icon} {info.label}</Link>
          </div>
          <p className="mt-1 text-muted">{project.summary}</p>
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted">
            <span><b className="text-text">{formatNumber(project.downloads)}</b> downloads</span>
            <span>Updated {timeAgo(project.updated_at)}</span>
            {project.owner && (
              <Link href={`/user/${project.owner.username}`} className="hover:text-text">
                by <b className="text-text">{project.owner.username}</b>
              </Link>
            )}
          </div>
        </div>
        {isOwner && (
          <Link href={`/project/${project.slug}/edit`} className="btn-ghost">Manage project</Link>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          {project.gallery?.length > 0 && (
            <section className="card p-3">
              <div className="flex snap-x gap-3 overflow-x-auto">
                {project.gallery.map((src, i) => (
                  <a key={src} href={src} target="_blank" rel="noopener" className="shrink-0 snap-start">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`${project.title} screenshot ${i + 1}`} className="h-56 w-auto max-w-[80vw] rounded-lg border border-line object-cover" loading="lazy" />
                  </a>
                ))}
              </div>
            </section>
          )}
          <section className="card p-6">
            {project.description ? <Markdown>{project.description}</Markdown> : <p className="text-muted">No description yet.</p>}
          </section>

          <section id="versions" className="card overflow-hidden">
            <h2 className="border-b border-line px-6 py-4 text-lg font-bold">Versions</h2>
            {versions.length === 0 && <p className="p-6 text-muted">No versions uploaded yet.</p>}
            <ul className="divide-y divide-line">
              {versions.map((v) => (
                <li key={v.id} className="px-6 py-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <b>{v.name}</b>
                        <span className="text-sm text-muted">{v.version_number}</span>
                        <ChannelBadge channel={v.release_channel} />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {v.loaders.map((l) => <span key={l} className="chip capitalize">{l}</span>)}
                        {summarizeVersions(v.game_versions).map((g) => <span key={g} className="chip">{g}</span>)}
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        {timeAgo(v.created_at)} · {formatNumber(v.downloads)} downloads
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {PACKABLE.includes(project.type) && (
                        <AddToPackButton
                          item={{
                            versionId: v.id,
                            projectSlug: project.slug,
                            projectTitle: project.title,
                            versionNumber: v.version_number,
                            type: project.type,
                          }}
                        />
                      )}
                      {v.files?.map((f) => (
                        <a key={f.id} href={`/api/download/${f.id}`} rel={f.is_external ? "nofollow noopener" : undefined}
                          className={`${f.is_primary ? "btn-primary" : "btn-ghost"} px-3! py-1.5! text-xs`}
                          title={[f.is_external && `Link: ${new URL(f.url).hostname}`, f.sha1 && `sha1 ${f.sha1}`].filter(Boolean).join("\n")}>
                          {f.is_external ? "↗" : "↓"} {short(f.label || f.filename)}{f.size ? ` (${formatBytes(f.size)})` : ""}
                        </a>
                      ))}
                    </div>
                  </div>
                  {v.changelog && (
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer text-muted hover:text-text">Changelog</summary>
                      <div className="mt-2"><Markdown>{v.changelog}</Markdown></div>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-4">
          {latestFile && (
            <InstallPanel
              type={project.type}
              title={project.title}
              loaders={latest.loaders}
              downloadUrl={`/api/download/${latestFile.id}`}
              directUrl={latestFile.url}
              filename={latestFile.filename}
            />
          )}
          <div className="card space-y-4 p-4 text-sm">
            <Info title={info.loaderLabel}>
              {project.loaders.length ? project.loaders.map((l) => <span key={l} className="chip capitalize">{l}</span>) : "—"}
            </Info>
            {info.minecraft && (
              <Info title="Minecraft versions">
                {project.game_versions.length ? summarizeVersions(project.game_versions).map((g) => <span key={g} className="chip">{g}</span>) : "—"}
              </Info>
            )}
            {project.categories.length > 0 && (
              <Info title="Categories">
                {project.categories.map((c) => (
                  <Link key={c} href={`/browse?type=${project.type}&category=${c}`} className="chip hover:text-text">{c}</Link>
                ))}
              </Info>
            )}
            {project.license && <Info title="License">{project.license}</Info>}
            {(project.source_url || project.issues_url) && (
              <Info title="Links">
                {project.source_url && <a className="text-brand underline" href={project.source_url} rel="nofollow noopener" target="_blank">Source</a>}
                {project.issues_url && <a className="text-brand underline" href={project.issues_url} rel="nofollow noopener" target="_blank">Issues</a>}
              </Info>
            )}
            <Info title="API">
              <code className="break-all text-xs text-muted">{siteUrl()}/api/v2/project/{project.slug}</code>
            </Info>
          </div>
        </aside>
      </div>
    </div>
  );
}

const short = (s: string) => (s.length > 32 ? s.slice(0, 29) + "…" : s);

function Info({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label">{title}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function ChannelBadge({ channel }: { channel: string }) {
  const color =
    channel === "release" ? "text-brand border-brand/50" : channel === "beta" ? "text-amber-300 border-amber-300/50" : "text-red-300 border-red-300/50";
  return <span className={`chip ${color}`}>{channel}</span>;
}

/** Collapse long version lists, e.g. 1.20, 1.20.1 … 1.20.6 → "1.20.x". */
function summarizeVersions(versions: string[]) {
  if (versions.length <= 4) return versions;
  const majors = new Map<string, number>();
  for (const v of versions) {
    const m = v.split(".").slice(0, 2).join(".");
    majors.set(m, (majors.get(m) ?? 0) + 1);
  }
  return [...majors.entries()]
    .sort((a, b) => b[0].localeCompare(a[0], undefined, { numeric: true }))
    .map(([m, n]) => (n > 1 ? `${m}.x` : versions.find((v) => v.startsWith(m))!));
}
