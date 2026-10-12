import { badRequest, json, preflight } from "@/lib/api";
import { createPublicClient } from "@/lib/supabase/server";
import { isMcType, launcherHit, PROJECT_SELECT, typesForEdition } from "@/lib/launcherApi";
import type { Project } from "@/lib/types";

export const OPTIONS = preflight;

/**
 * GET /api/launcher/v1/featured?type=mod&edition=java|bedrock|all&limit=10 — rows for a
 * launcher's home screen. type takes a comma list; without it, edition decides (default java).
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const requested = (sp.get("type") ?? "").split(",").map((s) => s.trim()).filter(isMcType);
  const editionTypes = typesForEdition(sp.get("edition"));
  if (!editionTypes) return badRequest("edition must be java, bedrock or all");
  const types = requested.length ? requested : editionTypes;
  const limit = Math.min(30, Math.max(1, Number(sp.get("limit")) || 10));
  const db = createPublicClient();
  const base = () => db.from("projects").select(PROJECT_SELECT).in("type", types).limit(limit);
  const [popular, updated, newest] = await Promise.all([
    base().order("downloads", { ascending: false }),
    base().order("updated_at", { ascending: false }),
    base().order("created_at", { ascending: false }),
  ]);
  const map = (r: { data: unknown }) => ((r.data ?? []) as Project[]).map(launcherHit);
  return json({ popular: map(popular), recently_updated: map(updated), newest: map(newest) }, { cache: 120 });
}
