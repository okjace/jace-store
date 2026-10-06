import { createPublicClient } from "@/lib/supabase/server";
import { json, notFound, parseList, preflight, serializeVersion, UUID_RE } from "@/lib/api";
import type { Version } from "@/lib/types";

export const OPTIONS = preflight;

/** GET /api/v2/project/{id|slug}/version?loaders=["fabric"]&game_versions=["1.20.1"] */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sp = new URL(req.url).searchParams;
  const supabase = createPublicClient();
  const { data: project } = await supabase
    .from("projects").select("id, owner_id").eq(UUID_RE.test(id) ? "id" : "slug", id).maybeSingle();
  if (!project) return notFound("project");

  let q = supabase.from("versions").select("*, files(*)").eq("project_id", project.id);
  const loaders = parseList(sp.get("loaders"));
  const gameVersions = parseList(sp.get("game_versions"));
  if (loaders?.length) q = q.overlaps("loaders", loaders);
  if (gameVersions?.length) q = q.overlaps("game_versions", gameVersions);
  const { data } = await q.order("created_at", { ascending: false });
  return json((data as Version[]).map((v) => serializeVersion(v, project.owner_id)));
}
