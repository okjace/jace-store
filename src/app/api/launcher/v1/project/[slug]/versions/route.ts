import { json, notFound, preflight } from "@/lib/api";
import { findMcProject, launcherVersion, mcVersions } from "@/lib/launcherApi";

export const OPTIONS = preflight;

/**
 * GET /api/launcher/v1/project/{slug}/versions?loader=fabric&game_version=1.21.1&channel=release
 * channel=release → releases only; channel=beta → releases + betas; omitted → everything.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const project = await findMcProject((await params).slug);
  if (!project) return notFound("project");
  const sp = new URL(req.url).searchParams;
  const versions = await mcVersions(project.id, {
    loader: sp.get("loader"), game_version: sp.get("game_version"), channel: sp.get("channel"),
  });
  return json(versions.map(launcherVersion));
}
