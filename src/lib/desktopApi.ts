import { createPublicClient } from "./supabase/server";
import { siteUrl, typeInfo } from "./constants";
import { DESKTOP_TYPES, fileInstallInfo, fitScore, type Client } from "./fileFormats";
import type { FileRow, Project, Version } from "./types";

/**
 * Desktop app API (v1): apps and games from the store, with every file described
 * as format / platform / arch / action so the Jace Store app can pick and install
 * the right download for the computer it runs on. Public, read-only, CORS-enabled.
 */

export const isDesktopType = (t: string) => (DESKTOP_TYPES as readonly string[]).includes(t);
export const PROJECT_SELECT = "*, owner:profiles!projects_owner_id_fkey(username, display_name, avatar_url)";

export function desktopFile(f: FileRow) {
  return {
    id: f.id,
    filename: f.filename,
    label: f.label,
    primary: f.is_primary,
    external: f.is_external,
    size: f.size,
    hashes: f.sha1 && f.sha512 ? { sha1: f.sha1, sha512: f.sha512 } : null,
    url: `${siteUrl()}/api/download/${f.id}`,
    direct_url: f.url,
    ...fileInstallInfo(f),
  };
}

export function desktopVersion(v: Version) {
  return {
    id: v.id,
    name: v.name,
    version_number: v.version_number,
    channel: v.release_channel,
    platforms: v.loaders,
    changelog: v.changelog,
    published_at: v.created_at,
    files: [...(v.files ?? [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary)).map(desktopFile),
  };
}

export function desktopHit(p: Project) {
  const info = typeInfo(p.type);
  return {
    id: p.id,
    slug: p.slug,
    type: p.type,
    type_label: info.label,
    title: p.title,
    summary: p.summary,
    icon_url: p.icon_url,
    author: p.owner?.username ?? null,
    downloads: p.downloads,
    categories: p.categories,
    platforms: p.loaders,
    updated_at: p.updated_at,
    page_url: `${siteUrl()}/project/${p.slug}`,
  };
}

export function desktopProject(p: Project) {
  return {
    ...desktopHit(p),
    description: p.description,
    gallery: p.gallery ?? [],
    license: p.license,
    source_url: p.source_url,
    issues_url: p.issues_url,
    created_at: p.created_at,
  };
}

export async function findDesktopProject(slugOrId: string) {
  const isId = /^[0-9a-f-]{36}$/i.test(slugOrId);
  const { data } = await createPublicClient().from("projects").select(PROJECT_SELECT)
    .eq(isId ? "id" : "slug", slugOrId).maybeSingle();
  return data && isDesktopType(data.type) ? (data as Project) : null;
}

export async function projectVersions(projectId: string, channel?: string | null) {
  let q = createPublicClient().from("versions").select("*, files(*)").eq("project_id", projectId);
  if (channel === "release" || !channel) q = q.eq("release_channel", "release");
  else if (channel === "beta") q = q.in("release_channel", ["release", "beta"]);
  const { data } = await q.order("created_at", { ascending: false });
  return (data ?? []) as Version[];
}

/** Parse ?os=&family=&arch=&has= into a Client, or an error message. */
export function clientFrom(sp: URLSearchParams): Client | string {
  const os = sp.get("os");
  if (os !== "windows" && os !== "macos" && os !== "linux" && os !== "android") return "os must be windows, macos, linux or android";
  const arch = sp.get("arch");
  if (arch && arch !== "x64" && arch !== "arm64") return "arch must be x64 or arm64";
  const has = sp.get("has");
  return {
    os,
    family: sp.get("family"),
    arch: (arch as Client["arch"]) ?? null,
    has: has == null ? undefined : has.split(",").map((s) => s.trim()).filter(Boolean),
  };
}

/** The best file of a version for this computer, with every option ranked. */
export function pickFile(v: Version, c: Client) {
  const ranked = (v.files ?? [])
    .map((f) => ({ f, info: fileInstallInfo(f) }))
    .map((x) => ({ ...x, score: fitScore(x.info, c) }))
    .filter((x) => x.score >= 0)
    .map((x) => ({ ...x, score: x.score + (x.f.is_primary ? 1 : 0) }))   // tie-break only, never makes an unusable file usable
    .sort((a, b) => b.score - a.score);
  return { best: ranked[0]?.f ?? null, options: ranked.map((x) => x.f) };
}

/**
 * The version the app should install: the owner's pinned version if it has a file
 * for this computer, otherwise the newest version that does.
 */
export function pickVersion(p: Project, versions: Version[], c: Client) {
  const usable = versions.filter((v) => pickFile(v, c).best);
  if (p.download_mode === "primary") {
    const pinned = usable.find((v) => v.id === p.primary_version_id);
    if (pinned) return pinned;
  }
  return usable[0] ?? null;
}
