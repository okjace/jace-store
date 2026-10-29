import { json, preflight } from "@/lib/api";
import { createPublicClient } from "@/lib/supabase/server";
import { DESKTOP_TYPES } from "@/lib/fileFormats";
import { desktopHit, isDesktopType, PROJECT_SELECT } from "@/lib/desktopApi";
import type { Project } from "@/lib/types";

export const OPTIONS = preflight;

/** GET /api/desktop/v1/featured?type=app&os=windows&limit=12 — rows for the app's home page. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const types = (sp.get("type") ?? "").split(",").filter(isDesktopType);
  const limit = Math.min(30, Math.max(1, Number(sp.get("limit")) || 12));
  const os = sp.get("os");
  const db = createPublicClient();
  const base = () => {
    let q = db.from("projects").select(PROJECT_SELECT).in("type", types.length ? types : [...DESKTOP_TYPES]).limit(limit);
    if (os) q = q.overlaps("loaders", [os, "cross-platform", "web", "any"]);
    return q;
  };
  const [popular, updated, newest] = await Promise.all([
    base().order("downloads", { ascending: false }),
    base().order("updated_at", { ascending: false }),
    base().order("created_at", { ascending: false }),
  ]);
  const map = (r: { data: unknown }) => ((r.data ?? []) as Project[]).map(desktopHit);
  return json({ popular: map(popular), recently_updated: map(updated), newest: map(newest) }, { cache: 120 });
}
