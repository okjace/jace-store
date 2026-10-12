import { json, notFound, preflight } from "@/lib/api";
import { siteUrl, typeInfo } from "@/lib/constants";
import { findMcProject, installMethod, launcherFile, launcherVersion, mcVersions } from "@/lib/launcherApi";

export const OPTIONS = preflight;

/**
 * GET /api/launcher/v1/project/{slug}/resolve?loader=fabric&game_version=1.21.1&channel=release
 * "I have this instance — what exactly do I download, and where does it go?"
 * Returns the best matching version, its primary file and the target path.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const project = await findMcProject((await params).slug);
  if (!project) return notFound("project");
  const sp = new URL(req.url).searchParams;
  const versions = await mcVersions(project.id, {
    loader: sp.get("loader"), game_version: sp.get("game_version"), channel: sp.get("channel") ?? "release",
  });
  // Respect the creator's pinned version when it fits the instance.
  const version =
    (project.download_mode === "primary" && versions.find((v) => v.id === project.primary_version_id)) || versions[0];
  if (!version) {
    return json({
      error: "no_compatible_version",
      description: "No version of this project matches that loader / game version / channel.",
    }, { status: 404, cache: 30 });
  }
  const files = [...(version.files ?? [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  const file = files.find((f) => f.sha1) ?? files[0];
  const dir = typeInfo(project.type).installDir;
  return json({
    project: { id: project.id, slug: project.slug, title: project.title, type: project.type },
    version: launcherVersion(version),
    file: file ? launcherFile(file) : null,
    install: {
      method: installMethod(project.type),
      directory: dir,
      path: dir && file ? `${dir}/${file.filename}` : null,
      /** Modpacks: feed this to your instance importer. */
      import_url: project.type === "modpack" && file ? `${siteUrl()}/api/download/${file.id}` : null,
    },
  }, { cache: 30 });
}
