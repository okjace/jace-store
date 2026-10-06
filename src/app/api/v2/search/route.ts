import { createPublicClient } from "@/lib/supabase/server";
import { json, serializeSearchHit, preflight } from "@/lib/api";
import type { Project } from "@/lib/types";

export const OPTIONS = preflight;

/**
 * GET /api/v2/search?query=&facets=[["project_type:mod"],["versions:1.20.1"]]&index=downloads&offset=0&limit=10
 * Facets follow Modrinth's syntax: outer array = AND, inner array = OR.
 * Supported facet keys: project_type, categories (incl. loaders), versions.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 10));
  const offset = Math.max(0, Number(sp.get("offset")) || 0);
  const index = sp.get("index") ?? "relevance";
  const q = (sp.get("query") ?? "").replace(/[%,()]/g, " ").trim();

  const supabase = createPublicClient();
  let query = supabase
    .from("projects")
    .select("*, owner:profiles(username, display_name, avatar_url)", { count: "exact" });
  if (q) query = query.or(`title.ilike.%${q}%,summary.ilike.%${q}%`);

  let facets: string[][] = [];
  try {
    facets = JSON.parse(sp.get("facets") ?? "[]");
  } catch {}
  for (const group of Array.isArray(facets) ? facets : []) {
    const ors: string[] = [];
    for (const f of Array.isArray(group) ? group : []) {
      const [key, ...rest] = String(f).split(":");
      const val = rest.join(":").replace(/[",(){}]/g, "");
      if (!val) continue;
      if (key === "project_type") ors.push(`type.eq.${val}`);
      else if (key === "versions") ors.push(`game_versions.cs.{${val}}`);
      else if (key === "categories") ors.push(`categories.cs.{${val}}`, `loaders.cs.{${val}}`);
    }
    if (ors.length) query = query.or(ors.join(","));
  }

  query =
    index === "updated" ? query.order("updated_at", { ascending: false })
    : index === "newest" ? query.order("created_at", { ascending: false })
    : query.order("downloads", { ascending: false });

  const { data, count, error } = await query.range(offset, offset + limit - 1);
  if (error) return json({ error: "search_error", description: error.message }, { status: 500, cache: 0 });
  return json({
    hits: (data as Project[]).map(serializeSearchHit),
    offset,
    limit,
    total_hits: count ?? 0,
  });
}
