import { json, notFound, preflight } from "@/lib/api";
import { findMcProject, launcherProject, launcherVersion, mcVersions } from "@/lib/launcherApi";

export const OPTIONS = preflight;

/** GET /api/launcher/v1/project/{slug|id} — details page data, with the newest version. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const project = await findMcProject((await params).slug);
  if (!project) return notFound("project");
  const versions = await mcVersions(project.id);
  const featured =
    (project.download_mode === "primary" && versions.find((v) => v.id === project.primary_version_id)) || versions[0];
  return json({
    ...launcherProject(project),
    version_count: versions.length,
    featured_version: featured ? launcherVersion(featured) : null,
  });
}
