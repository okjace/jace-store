import { badRequest, json, preflight } from "@/lib/api";
import { createPublicClient } from "@/lib/supabase/server";
import { DESKTOP_TYPES } from "@/lib/fileFormats";
import { desktopHit, isDesktopType, PROJECT_SELECT } from "@/lib/desktopApi";
import type { Project } from "@/lib/types";

export const OPTIONS = preflight;

/**
 * GET /api/desktop/v1/search?q=&type=app,game&os=linux&category=&sort=downloads|updated|newest|title&page=1&limit=24
 * os narrows to projects that list that platform (or cross-platform / web).
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const list = (k: string) => (sp.get(k) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const types = list("type");
  const bad = types.find((t) => !isDesktopType(t));
  if (bad) return badRequest(`Unknown type "${bad}". Use: ${DESKTOP_TYPES.join(", ")}`);
  const limit = Math.min(50, Math.max(1, Number(sp.get("limit")) || 24));
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const sort = sp.get("sort") ?? "downloads";
  const q = (sp.get("q") ?? "").replace(/[%,()]/g, " ").trim().slice(0, 100);

  let query = createPublicClient().from("projects").select(PROJECT_SELECT, { count: "exact" })
    .in("type", types.length ? types : [...DESKTOP_TYPES]);
  if (q) query = query.or(`title.ilike.%${q}%,summary.ilike.%${q}%,slug.ilike.%${q}%`);
  const os = sp.get("os");
  if (os) query = query.overlaps("loaders", [os, "cross-platform", "web", "steam-deck", "any"].filter((x) => os === "linux" || x !== "steam-deck"));
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
  return json({ hits: (data as Project[]).map(desktopHit), total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) }, { cache: 30 });
}
