import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatBytes, formatNumber, siteUrl, timeAgo, typeInfo } from "@/lib/constants";
import type { Project, Version } from "@/lib/types";
import Markdown from "@/components/Markdown";
import ProjectIcon from "@/components/ProjectIcon";
import InstallPanel from "@/components/InstallPanel";
import AddToPackButton from "@/components/AddToPackButton";
import DownloadButton, { type DlVersion } from "@/components/DownloadButton";
import ReportButton from "@/components/ReportButton";
import { DESKTOP_TYPES } from "@/lib/fileFormats";
import { dependencyUrl, type Dependency } from "@/lib/dependencyTypes";
import LikeButton from "@/components/LikeButton";
import Comments, { type CommentRow } from "@/components/Comments";
import SaveToCollection from "@/components/SaveToCollection";
import { currentState, restriction } from "@/lib/accountModeration";
import { isAdmin } from "@/lib/moderation";

const PACKABLE = ["mod", "resourcepack", "shader"];

async function load(slug: string) {
  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("*, owner:profiles!projects_owner_id_fkey(username, display_name, avatar_url)")
    .eq("slug", slug)
    .maybeSingle();
  if (!project) return null;
  const [{ data: versions }, { data: auth }, { data: comments }] = await Promise.all([
    supabase.from("versions").select("*, files(*)").eq("project_id", project.id).order("created_at", { ascending: false }),
    supabase.auth.getUser(),
    // (before migration 011 there's no comments table: no comments)
    supabase.from("comments").select("id, user_id, parent_id, body, created_at, edited_at, author:profiles(username, display_name, avatar_url)")
      .eq("project_id", project.id).order("created_at").limit(500),
  ]);
  const me = auth.user?.id ?? null;
  const [liked, notice, moderator] = me
    ? await Promise.all([
        supabase.from("likes").select("project_id").eq("user_id", me).eq("project_id", project.id).maybeSingle().then((r) => !!r.data),
        currentState(me).then((s) => restriction(s)?.message ?? null),
        isAdmin(me),
      ])
    : [false, null, false];
  return {
    project: project as Project,
    versions: (versions ?? []) as Version[],
    isOwner: me === project.owner_id,
    signedIn: !!me,
    me, liked, notice, moderator,
    comments: (comments ?? []) as unknown as CommentRow[],
  };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const data = await load((await params).slug);
  return data ? { title: data.project.title, description: data.project.summary } : {};
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const data = await load((await params).slug);
  if (!data) notFound();
  const { project, versions, isOwner, signedIn, me, liked, notice, moderator, comments } = data;
  const loginHref = `/login?next=${encodeURIComponent(`/project/${project.slug}`)}`;
  const info = typeInfo(project.type);
  const mode = project.download_mode ?? "latest";
  // The version the Download button points at: the owner's pick, or the newest.
  const featured =
    (mode === "primary" && versions.find((v) => v.id === project.primary_version_id)) || versions[0];
  const featuredFile = featured?.files?.find((f) => f.is_primary) ?? featured?.files?.[0];
  const dlVersions: DlVersion[] = versions.map((v) => ({
    id: v.id, name: v.name, version_number: v.version_number, release_channel: v.release_channel,
    created_at: v.created_at, game_versions: v.game_versions, loaders: v.loaders,
    files: (v.files ?? []).sort((a, b) => Number(b.is_primary) - Number(a.is_primary)).map((f) => ({
      id: f.id, filename: f.filename, label: f.label, size: f.size, is_primary: f.is_primary, is_external: f.is_external,
    })),
  }));
  // "Requires" in the sidebar: every required dependency of the featured version.
  const requires = (featured?.dependencies ?? []).filter((d) => d.type === "required");
  const download = (className?: string) => (
    <DownloadButton mode={mode} file={featuredFile ?? null} versions={dlVersions} className={className}>
      {mode === "all" ? `Download (${versions.length} version${versions.length === 1 ? "" : "s"})` : "Download"}
    </DownloadButton>
  );

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
        <div className="flex flex-wrap gap-2">
          {(featuredFile || (mode === "all" && versions.length > 0)) && download("btn-primary px-6! py-2.5! text-base")}
          <LikeButton slug={project.slug} liked={liked} likes={project.likes ?? 0} signedIn={signedIn} loginHref={loginHref} />
          <SaveToCollection projectId={project.id} signedIn={signedIn} loginHref={loginHref} />
          {(DESKTOP_TYPES as readonly string[]).includes(project.type) && versions.length > 0 && (
            <a href={`jacestore://project/${project.slug}`} className="btn-ghost" title="Opens the Jace Store desktop app (get it at /desktop)">
              Open in Jace Store app
            </a>
          )}
          {isOwner && (
            <Link href={`/project/${project.slug}/edit`} className="btn-ghost">Manage project</Link>
          )}
        </div>
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
                        {mode === "primary" && v.id === featured?.id && <span className="chip chip-on">★ primary</span>}
                        <ChannelBadge channel={v.release_channel} />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {v.loaders.map((l) => <span key={l} className="chip capitalize">{l}</span>)}
                        {summarizeVersions(v.game_versions).map((g) => <span key={g} className="chip">{g}</span>)}
                      </div>
                      {(v.dependencies ?? []).some((d) => d.type === "required") && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                          Requires {v.dependencies!.filter((d) => d.type === "required").map((d) => <DepLink key={d.source + d.project} d={d} />)}
                        </div>
                      )}
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

          <Comments projectId={project.id} slug={project.slug} title={project.title} initial={comments} me={me}
            ownerId={project.owner_id} moderator={moderator} notice={notice} loginHref={loginHref} />
        </div>

        <aside className="space-y-4">
          {featuredFile && (
            <InstallPanel
              type={project.type}
              title={project.title}
              loaders={featured.loaders}
              directUrl={featuredFile.url}
              filename={featuredFile.filename}
              versionNote={mode === "all" ? `Newest: ${featured.version_number}` : featured.version_number}
              downloadButton={download()}
            />
          )}
          <div className="card space-y-4 p-4 text-sm">
            {requires.length > 0 && (
              <Info title="Requires">
                {requires.map((d) => <DepLink key={d.source + d.project} d={d} />)}
              </Info>
            )}
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
            {!isOwner && (
              <div className="border-t border-line pt-3">
                <ReportButton projectId={project.id} projectTitle={project.title} signedIn={signedIn}
                  loginHref={`/login?next=${encodeURIComponent(`/project/${project.slug}`)}`} />
              </div>
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

function DepLink({ d }: { d: Dependency }) {
  const external = d.source !== "jace";
  return (
    <a href={dependencyUrl(d)} className="chip hover:text-text" {...(external ? { target: "_blank", rel: "noopener" } : {})}>
      {d.project}{external ? " ↗" : ""}
    </a>
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
