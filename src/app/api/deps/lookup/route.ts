import { ApiError, handler } from "@/lib/apiAuth";
import { findDepProject } from "@/lib/depResolve";

/** GET ?source=curseforge|modrinth&project=slug-or-link → { title, project, url } (for the dependency pickers). */
export const GET = handler(async (req) => {
  const sp = new URL(req.url).searchParams;
  const source = sp.get("source");
  if (source !== "modrinth" && source !== "curseforge") throw new ApiError(400, "source must be modrinth or curseforge");
  const p = await findDepProject(source, sp.get("project") ?? "");
  if (!p) throw new ApiError(404, "Not found");
  return { title: p.title, project: p.project, url: p.url };
});
