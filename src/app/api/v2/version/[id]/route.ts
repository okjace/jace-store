import { createPublicClient } from "@/lib/supabase/server";
import { json, notFound, preflight, serializeVersion, UUID_RE } from "@/lib/api";
import type { Version } from "@/lib/types";

export const OPTIONS = preflight;

/** GET /api/v2/version/{id} */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return notFound("version");
  const { data } = await createPublicClient()
    .from("versions").select("*, files(*), project:projects!versions_project_id_fkey(owner_id)").eq("id", id).maybeSingle();
  if (!data) return notFound("version");
  return json(serializeVersion(data as Version, (data as { project?: { owner_id: string } }).project?.owner_id));
}
