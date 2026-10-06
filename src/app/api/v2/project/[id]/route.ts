import { createPublicClient } from "@/lib/supabase/server";
import { json, notFound, preflight, serializeProject, UUID_RE } from "@/lib/api";
import type { Project } from "@/lib/types";

export const OPTIONS = preflight;

/** GET /api/v2/project/{id|slug} */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("projects")
    .select("*, owner:profiles(username, display_name, avatar_url), versions!versions_project_id_fkey(id, created_at)")
    .eq(UUID_RE.test(id) ? "id" : "slug", id)
    .maybeSingle();
  if (!data) return notFound("project");
  const versions = ((data.versions ?? []) as { id: string; created_at: string }[])
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((v) => v.id);
  return json(serializeProject(data as Project, versions));
}
