import { badRequest, json, preflight } from "@/lib/api";
import { createPublicClient } from "@/lib/supabase/server";
import { editionOf, isMcType, launcherHit, MC_TYPE_IDS, PROJECT_SELECT, typesForEdition } from "@/lib/launcherApi";
import type { Project } from "@/lib/types";

export const OPTIONS = preflight;

/**
 * GET /api/launcher/v1/search
 *   ?q=sodium &type=mod &loader=fabric &game_version=1.21.1 &category=optimization
 *   &sort=downloads|updated|newest|title &page=1 &limit=20
 *   &edition=java|bedrock|all
 * type, loader and category accept comma-separated lists (any match). Without a type,
 * only Java Edition content is returned unless edition=bedrock or edition=all.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const list = (k: string) => (sp.get(k) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const types = list("type");
  const bad = types.find((t) => !isMcType(t));
  if (bad) return badRequest(`Unknown type "${bad}". Use one of: ${MC_TYPE_IDS.join(", ")}`);
  const edition = sp.get("edition");
  const editionTypes = typesForEdition(edition);
  if (!editionTypes) return badRequest(`edition must be java, bedrock or all`);
  // An explicit edition narrows explicit types too (e.g. type=world&edition=bedrock -> nothing).
  const searchTypes = types.length
    ? types.filter((t) => !edition || edition === "all" || editionOf(t) === edition)
    : editionTypes;
  const limit = Math.min(50, Math.max(1, Number(sp.get("limit")) || 20));
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const sort = sp.get("sort") ?? "downloads";
  const q = (sp.get("q") ?? "").replace(/[%,()]/g, " ").trim().slice(0, 100);

  let query = createPublicClient().from("projects").select(PROJECT_SELECT, { count: "exact" })
    .in("type", searchTypes.length ? searchTypes : ["__none__"]);
  if (q) query = query.or(`title.ilike.%${q}%,summary.ilike.%${q}%,slug.ilike.%${q}%`);
  const loaders = list("loader");
  if (loaders.length) query = query.overlaps("loaders", loaders);
  const gv = sp.get("game_version");
  if (gv) query = query.contains("game_versions", [gv]);
  const cats = list("category");
  if (cats.length) query = query.overlaps("categories", cats);
  query =
    sort === "updated" ? query.order("updated_at", { ascending: false })
    : sort === "newest" ? query.order("created_at", { ascending: false })
    : sort === "title" ? query.order("title", { ascending: true })
    : query.order("downloads", { ascending: false });

  const { data, count, error } = await query.range((page - 1) * limit, page * limit - 1);
  if (error) return json({ error: "search_failed", description: error.message }, { status: 500, cache: 0 });
  const total = count ?? 0;
  return json({
    hits: (data as Project[]).map(launcherHit),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  }, { cache: 30 });
}
