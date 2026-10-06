import { createPublicClient } from "@/lib/supabase/server";
import { badRequest, json, notFound, preflight, serializeVersion } from "@/lib/api";
import { algorithmFrom, versionsByHashes } from "@/lib/hashLookup";
import type { Version } from "@/lib/types";

export const OPTIONS = preflight;

/**
 * POST /api/v2/version_file/{hash}/update?algorithm=sha1
 * Body: { "loaders": ["fabric"], "game_versions": ["1.20.1"] }
 * Returns the newest version of the same project matching the filters — used for update checks.
 */
export async function POST(req: Request, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const algorithm = algorithmFrom(new URL(req.url).searchParams.get("algorithm"));
  let body: { loaders?: string[]; game_versions?: string[] } = {};
  try { body = await req.json(); } catch { return badRequest("Body must be JSON"); }

  const current = (await versionsByHashes([hash], algorithm)).get(hash.toLowerCase());
  if (!current) return notFound("file");

  let q = createPublicClient().from("versions").select("*, files(*)").eq("project_id", current.project_id);
  if (body.loaders?.length) q = q.overlaps("loaders", body.loaders);
  if (body.game_versions?.length) q = q.overlaps("game_versions", body.game_versions);
  const { data } = await q.order("created_at", { ascending: false }).limit(1);
  const latest = (data as Version[] | null)?.[0];
  return latest ? json(serializeVersion(latest, current.owner_id)) : notFound("matching version");
}
