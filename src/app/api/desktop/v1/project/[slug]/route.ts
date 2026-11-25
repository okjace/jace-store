import { json, notFound, preflight } from "@/lib/api";
import { desktopProject, desktopVersion, findDesktopProject, projectVersions } from "@/lib/desktopApi";
import { optionalApiUser } from "@/lib/apiAuth";
import { hasAccess } from "@/lib/payments";
import { isPaid } from "@/lib/pricing";

export const OPTIONS = preflight;

/** GET /api/desktop/v1/project/{slug|id}?channel=release|beta|all — details and every version's files. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const project = await findDesktopProject((await params).slug);
  if (!project) return notFound("project");
  const channel = new URL(req.url).searchParams.get("channel");
  const versions = await projectVersions(project.id, channel === "all" ? "alpha" : channel);
  // paid projects: can the signed-in account (Authorization: Bearer) download it?
  const access = isPaid(project) ? await hasAccess(await optionalApiUser(req), project) : true;
  return json({ ...desktopProject(project), access, versions: versions.slice(0, 30).map(desktopVersion) }, isPaid(project) ? { cache: 0 } : undefined);
}
