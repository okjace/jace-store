import { badRequest, json, notFound, preflight } from "@/lib/api";
import { clientFrom, desktopFile, findDesktopProject, pickFile, pickVersion, projectVersions } from "@/lib/desktopApi";

export const OPTIONS = preflight;

/**
 * GET /api/desktop/v1/project/{slug}/resolve?os=linux&family=arch&arch=x64&has=flatpak&channel=release
 * "What do I download for this computer, and do I install it or open it?"
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const project = await findDesktopProject((await params).slug);
  if (!project) return notFound("project");
  const sp = new URL(req.url).searchParams;
  const client = clientFrom(sp);
  if (typeof client === "string") return badRequest(client);
  const versions = await projectVersions(project.id, sp.get("channel"));
  const version = pickVersion(project, versions, client);
  if (!version) {
    return json({ error: "no_compatible_file", description: "This project has no download for your computer." }, { status: 404, cache: 30 });
  }
  const { best, options } = pickFile(version, client);
  return json({
    project: { id: project.id, slug: project.slug, title: project.title, type: project.type, icon_url: project.icon_url },
    version: { id: version.id, name: version.name, version_number: version.version_number, channel: version.release_channel, published_at: version.created_at },
    file: desktopFile(best!),
    alternatives: options.slice(1).map(desktopFile),
  }, { cache: 30 });
}
