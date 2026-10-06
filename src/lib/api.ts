import { NextResponse } from "next/server";
import { siteUrl } from "./constants";
import type { FileRow, Project, Version } from "./types";

/**
 * Serializers that follow the shape of Modrinth's v2 API so that existing
 * launcher/updater code written against Modrinth can talk to this store by
 * swapping the base URL.
 */

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, User-Agent",
};

export function json(body: unknown, init: { status?: number; cache?: number } = {}) {
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: {
      ...CORS,
      "Cache-Control": `public, s-maxage=${init.cache ?? 60}, stale-while-revalidate=300`,
    },
  });
}

export const notFound = (what = "resource") =>
  json({ error: "not_found", description: `The requested ${what} was not found` }, { status: 404, cache: 10 });

export const badRequest = (description: string) =>
  json({ error: "invalid_input", description }, { status: 400, cache: 0 });

export const preflight = () => new NextResponse(null, { status: 204, headers: CORS });

export function serializeFile(f: FileRow) {
  return {
    hashes: { sha1: f.sha1, sha512: f.sha512 },
    url: `${siteUrl()}/api/download/${f.id}`,
    direct_url: f.url,
    filename: f.filename,
    primary: f.is_primary,
    size: f.size,
    file_type: null,
  };
}

export function serializeVersion(v: Version, authorId?: string) {
  return {
    id: v.id,
    project_id: v.project_id,
    author_id: authorId ?? null,
    featured: false,
    name: v.name,
    version_number: v.version_number,
    changelog: v.changelog,
    dependencies: [],
    game_versions: v.game_versions,
    version_type: v.release_channel,
    loaders: v.loaders,
    status: "listed",
    date_published: v.created_at,
    downloads: v.downloads,
    files: (v.files ?? [])
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      .map(serializeFile),
  };
}

export function serializeProject(p: Project, versionIds: string[] = []) {
  return {
    id: p.id,
    slug: p.slug,
    project_type: p.type,
    title: p.title,
    description: p.summary,
    body: p.description,
    categories: p.categories,
    loaders: p.loaders,
    game_versions: p.game_versions,
    downloads: p.downloads,
    followers: 0,
    icon_url: p.icon_url,
    gallery: (p.gallery ?? []).map((url) => ({ url, featured: false, title: null, description: null })),
    client_side: "unknown",
    server_side: "unknown",
    status: "approved",
    license: p.license ? { id: p.license, name: p.license, url: null } : null,
    source_url: p.source_url,
    issues_url: p.issues_url,
    team: p.owner_id,
    author: p.owner?.username ?? null,
    published: p.created_at,
    updated: p.updated_at,
    versions: versionIds,
    page_url: `${siteUrl()}/project/${p.slug}`,
  };
}

export function serializeSearchHit(p: Project) {
  return {
    project_id: p.id,
    project_type: p.type,
    slug: p.slug,
    author: p.owner?.username ?? null,
    title: p.title,
    description: p.summary,
    categories: [...p.categories, ...p.loaders],
    display_categories: p.categories,
    versions: p.game_versions,
    downloads: p.downloads,
    follows: 0,
    icon_url: p.icon_url,
    date_created: p.created_at,
    date_modified: p.updated_at,
    license: p.license,
    client_side: "unknown",
    server_side: "unknown",
  };
}

/** Parse a JSON-array query param like loaders=["fabric","quilt"] (also accepts a,b). */
export function parseList(v: string | null): string[] | null {
  if (!v) return null;
  try {
    const parsed = JSON.parse(v);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {}
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
