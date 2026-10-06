import { createPublicClient } from "@/lib/supabase/server";
import { json, parseList, preflight, serializeProject, UUID_RE } from "@/lib/api";
import type { Project } from "@/lib/types";

export const OPTIONS = preflight;

/** GET /api/v2/projects?ids=["slug-or-id", ...] */
export async function GET(req: Request) {
  const ids = (parseList(new URL(req.url).searchParams.get("ids")) ?? []).slice(0, 100);
  if (!ids.length) return json([]);
  const uuids = ids.filter((i) => UUID_RE.test(i));
  const slugs = ids.filter((i) => !UUID_RE.test(i)).map((s) => s.replace(/[^a-z0-9_-]/gi, ""));
  const filters = [uuids.length && `id.in.(${uuids.join(",")})`, slugs.length && `slug.in.(${slugs.join(",")})`].filter(Boolean);
  const { data } = await createPublicClient()
    .from("projects")
    .select("*, owner:profiles(username, display_name, avatar_url), versions(id)")
    .or(filters.join(","));
  return json(((data ?? []) as (Project & { versions: { id: string }[] })[]).map((p) => serializeProject(p, p.versions.map((v) => v.id))));
}
