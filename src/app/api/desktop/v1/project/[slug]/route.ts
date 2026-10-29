import { json, notFound, preflight } from "@/lib/api";
import { desktopProject, desktopVersion, findDesktopProject, projectVersions } from "@/lib/desktopApi";

export const OPTIONS = preflight;

/** GET /api/desktop/v1/project/{slug|id}?channel=release|beta|all — details and every version's files. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const project = await findDesktopProject((await params).slug);
  if (!project) return notFound("project");
  const channel = new URL(req.url).searchParams.get("channel");
  const versions = await projectVersions(project.id, channel === "all" ? "alpha" : channel);
  return json({ ...desktopProject(project), versions: versions.slice(0, 30).map(desktopVersion) });
}
