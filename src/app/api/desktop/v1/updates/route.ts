import { badRequest, json, preflight } from "@/lib/api";
import { createPublicClient } from "@/lib/supabase/server";
import { clientFrom, desktopFile, isDesktopType, pickFile, pickVersion } from "@/lib/desktopApi";
import type { Project, Version } from "@/lib/types";

export const OPTIONS = preflight;

/**
 * POST /api/desktop/v1/updates?os=&family=&arch=&has=
 * Body: { "installed": [{ "project_id": "...", "version_id": "..." }, ...] }
 * For each installed project: is there a newer version with a file for this computer?
 */
export async function POST(req: Request) {
  const client = clientFrom(new URL(req.url).searchParams);
  if (typeof client === "string") return badRequest(client);
  let b: { installed?: { project_id?: string; version_id?: string }[] };
  try { b = await req.json(); } catch { return badRequest("Body must be JSON"); }
  const installed = (Array.isArray(b.installed) ? b.installed : [])
    .filter((x) => x && /^[0-9a-f-]{36}$/i.test(String(x.project_id)) && /^[0-9a-f-]{36}$/i.test(String(x.version_id)))
    .slice(0, 300);
  if (!installed.length) return json({ results: {} }, { cache: 0 });

  const db = createPublicClient();
  const ids = [...new Set(installed.map((x) => x.project_id!))];
  const [{ data: projects }, { data: versions }] = await Promise.all([
    db.from("projects").select("id, slug, title, type, download_mode, primary_version_id").in("id", ids),
    db.from("versions").select("*, files(*)").in("project_id", ids).eq("release_channel", "release").order("created_at", { ascending: false }),
  ]);
  const results: Record<string, unknown> = {};
  for (const p of (projects ?? []) as Project[]) {
    if (!isDesktopType(p.type)) continue;
    const mine = ((versions ?? []) as Version[]).filter((v) => v.project_id === p.id);
    const latest = pickVersion(p, mine, client);
    const have = installed.find((x) => x.project_id === p.id)!.version_id;
    const best = latest && pickFile(latest, client).best;
    results[p.id] = {
      project: { id: p.id, slug: p.slug, title: p.title },
      update_available: !!latest && latest.id !== have,
      latest_version: latest ? { id: latest.id, version_number: latest.version_number, name: latest.name, changelog: latest.changelog } : null,
      file: best ? desktopFile(best) : null,
    };
  }
  return json({ results }, { cache: 0 });
}
