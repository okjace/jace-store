import { badRequest, json, preflight } from "@/lib/api";
import { createPublicClient } from "@/lib/supabase/server";
import { isMcType, launcherFile, launcherVersion } from "@/lib/launcherApi";
import type { FileRow, Version } from "@/lib/types";

export const OPTIONS = preflight;

/**
 * POST /api/launcher/v1/updates
 * Body: { "hashes": ["<sha1>", ...], "algorithm": "sha1"|"sha512", "loader": "fabric",
 *         "game_version": "1.21.1", "channel": "release" }
 * Hash the files in an instance's mods/resourcepacks/shaderpacks folders and send
 * them here. For each file we know, returns what it is and whether an update fits.
 */
export async function POST(req: Request) {
  let b: { hashes?: unknown; algorithm?: string; loader?: string; game_version?: string; channel?: string };
  try { b = await req.json(); } catch { return badRequest("Body must be JSON"); }
  if (!Array.isArray(b.hashes)) return badRequest("hashes must be an array");
  const algo = b.algorithm === "sha512" ? "sha512" : "sha1";
  const hashes = [...new Set(b.hashes.map((h) => String(h).toLowerCase()).filter((h) => /^[0-9a-f]+$/.test(h)))].slice(0, 500);
  if (!hashes.length) return json({ results: {} }, { cache: 0 });

  const db = createPublicClient();
  const { data: files } = await db.from("files")
    .select(`${algo}, version:versions(*, project:projects!versions_project_id_fkey(id, slug, title, type, download_mode, primary_version_id))`)
    .in(algo, hashes);

  type Row = Record<string, unknown> & { version: Version & { project: { id: string; slug: string; title: string; type: string } } | null };
  const known = ((files ?? []) as unknown as Row[]).filter((r) => r.version && isMcType(r.version.project.type));
  const projectIds = [...new Set(known.map((r) => r.version!.project.id))];

  // Newest compatible version per project, in one query.
  let q = db.from("versions").select("*, files(*)").in("project_id", projectIds.length ? projectIds : ["00000000-0000-0000-0000-000000000000"]);
  if (b.loader) q = q.contains("loaders", [b.loader]);
  if (b.game_version) q = q.contains("game_versions", [b.game_version]);
  if ((b.channel ?? "release") === "release") q = q.eq("release_channel", "release");
  else if (b.channel === "beta") q = q.in("release_channel", ["release", "beta"]);
  const { data: candidates } = await q.order("created_at", { ascending: false });
  const latest = new Map<string, Version>();
  for (const v of (candidates ?? []) as Version[]) if (!latest.has(v.project_id)) latest.set(v.project_id, v);

  const results: Record<string, unknown> = {};
  for (const r of known) {
    const current = r.version!;
    const newest = latest.get(current.project.id);
    const newestFile = newest?.files ? ([...newest.files].sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0] as FileRow | undefined) : undefined;
    results[r[algo] as string] = {
      project: current.project,
      current_version: { id: current.id, version_number: current.version_number, published_at: current.created_at },
      update_available: !!newest && newest.id !== current.id && newest.created_at > current.created_at,
      latest_version: newest ? launcherVersion(newest) : null,
      latest_file: newestFile ? launcherFile(newestFile) : null,
    };
  }
  return json({ results }, { cache: 0 });
}
