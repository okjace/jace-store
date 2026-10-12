import { createPublicClient } from "./supabase/server";
import { GAME_VERSIONS, PROJECT_TYPES, siteUrl, typeInfo } from "./constants";
import type { FileRow, Project, Version } from "./types";

/**
 * Launcher API (v1): a Minecraft-only, launcher-friendly view of the store.
 * Everything here is public, read-only and CORS-enabled.
 */

export const MC_TYPES = PROJECT_TYPES.filter((t) => t.minecraft);
export const MC_TYPE_IDS = MC_TYPES.map((t) => t.id);
export const isMcType = (t: string) => MC_TYPE_IDS.includes(t as (typeof MC_TYPE_IDS)[number]);

export type Edition = "java" | "bedrock";
export const editionOf = (t: string): Edition => (typeInfo(t).edition === "bedrock" ? "bedrock" : "java");

/**
 * Types to search when the caller didn't name any. Defaults to Java so launchers
 * written before Bedrock content existed never get files they can't install.
 */
export function typesForEdition(edition: string | null): string[] | null {
  if (!edition || edition === "java") return MC_TYPE_IDS.filter((t) => editionOf(t) === "java");
  if (edition === "bedrock") return MC_TYPE_IDS.filter((t) => editionOf(t) === "bedrock");
  if (edition === "all") return [...MC_TYPE_IDS];
  return null;
}

const OWNER = "owner:profiles(username, display_name, avatar_url)";

export function launcherFile(f: FileRow) {
  return {
    id: f.id,
    filename: f.filename,
    label: f.label,
    primary: f.is_primary,
    external: f.is_external,
    size: f.size,
    hashes: f.sha1 && f.sha512 ? { sha1: f.sha1, sha512: f.sha512 } : null,
    /** Counts the download, then redirects. Prefer this. */
    url: `${siteUrl()}/api/download/${f.id}`,
    /** Where the bytes actually live (Supabase storage or the creator's link). */
    direct_url: f.url,
  };
}

export function launcherVersion(v: Version) {
  const files = [...(v.files ?? [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  return {
    id: v.id,
    project_id: v.project_id,
    name: v.name,
    version_number: v.version_number,
    channel: v.release_channel,
    loaders: v.loaders,
    game_versions: v.game_versions,
    /** [{source: "jace"|"modrinth", project: slug, type: "required"|"optional"|"incompatible"|"embedded"}] */
    dependencies: v.dependencies ?? [],
    changelog: v.changelog,
    downloads: v.downloads,
    published_at: v.created_at,
    files: files.map(launcherFile),
  };
}

export function launcherHit(p: Project) {
  return {
    id: p.id,
    slug: p.slug,
    type: p.type,
    title: p.title,
    summary: p.summary,
    /** "java" or "bedrock" */
    edition: editionOf(p.type),
    icon_url: p.icon_url,
    author: p.owner?.username ?? null,
    downloads: p.downloads,
    categories: p.categories,
    loaders: p.loaders,
    game_versions: p.game_versions,
    created_at: p.created_at,
    updated_at: p.updated_at,
    page_url: `${siteUrl()}/project/${p.slug}`,
  };
}

/** How a launcher installs this type. Bedrock files (.mcpack, .mcaddon, .mcworld, .mctemplate)
 *  are imported into the game's com.mojang folder, like double-clicking them on a phone. */
export function installMethod(type: string) {
  if (typeInfo(type).edition === "bedrock") return "bedrock_import";
  return type === "modpack" ? "import_instance" : type === "plugin" ? "server_plugins" : "copy_to_directory";
}

export function launcherProject(p: Project) {
  const info = typeInfo(p.type);
  return {
    ...launcherHit(p),
    description: p.description,
    gallery: p.gallery ?? [],
    license: p.license,
    source_url: p.source_url,
    issues_url: p.issues_url,
    author_avatar_url: p.owner?.avatar_url ?? null,
    install: {
      /** Folder inside the instance (.minecraft) to put the file in; null for modpacks. */
      directory: info.installDir,
      /** Modpacks are imported as a new instance instead of copied into a folder. */
      method: installMethod(p.type),
    },
    download_mode: p.download_mode ?? "latest",
  };
}

export async function findMcProject(slugOrId: string) {
  const isId = /^[0-9a-f-]{36}$/i.test(slugOrId);
  const { data } = await createPublicClient()
    .from("projects")
    .select(`*, ${OWNER}`)
    .eq(isId ? "id" : "slug", slugOrId)
    .maybeSingle();
  return data && isMcType(data.type) ? (data as Project) : null;
}

export interface VersionFilter { loader?: string | null; game_version?: string | null; channel?: string | null }

/** Versions of a project, newest first, optionally filtered for an instance. */
export async function mcVersions(projectId: string, f: VersionFilter = {}) {
  let q = createPublicClient().from("versions").select("*, files(*)").eq("project_id", projectId);
  if (f.loader) q = q.contains("loaders", [f.loader]);
  if (f.game_version) q = q.contains("game_versions", [f.game_version]);
  if (f.channel === "release") q = q.eq("release_channel", "release");
  else if (f.channel === "beta") q = q.in("release_channel", ["release", "beta"]);
  const { data } = await q.order("created_at", { ascending: false });
  return (data ?? []) as Version[];
}

export const PROJECT_SELECT = `*, ${OWNER}`;
export { GAME_VERSIONS };
