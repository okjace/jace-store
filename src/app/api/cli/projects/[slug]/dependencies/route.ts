import { guardPost } from "@/lib/accountModeration";
import { ApiError, handler, ownedProject, readJson, requireApiUser } from "@/lib/apiAuth";
import { typeInfo } from "@/lib/constants";
import { applyAutoDependencies, curseforgeReady, parseAutoDependencies } from "@/lib/depResolve";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;
type Ctx = { params: Promise<{ slug: string }> };

/** GET: the project's dependencies for every version. */
export const GET = handler(async (req, { params }: Ctx) => {
  const userId = await requireApiUser(req);
  const project = await ownedProject(userId, (await params).slug);
  return { dependencies: project.auto_dependencies ?? [], curseforge: curseforgeReady() };
});

/**
 * PUT { dependencies: ["modrinth:fabric-api", "curseforge:jei:optional", {source, project, type}] }
 * Saves the list and gives every version the matching release of each one (also to re-check after
 * the mods have new releases). Returns what each version got.
 */
export const PUT = handler(async (req, { params }: Ctx) => {
  const userId = await requireApiUser(req);
  const project = await ownedProject(userId, (await params).slug);
  if (!typeInfo(project.type).minecraft) throw new ApiError(400, "Dependencies for every version are for Minecraft content");
  if (!("auto_dependencies" in project)) throw new ApiError(503, "Jace Store's database needs migration 013 first");
  const b = await readJson<Record<string, unknown>>(req);
  await guardPost(userId, "version");
  const dependencies = await parseAutoDependencies(b.dependencies ?? []);
  const { error } = await createAdminClient().from("projects").update({ auto_dependencies: dependencies }).eq("id", project.id);
  if (error) throw new ApiError(400, error.message);
  return { dependencies, versions: await applyAutoDependencies(project.id) };
});
