import { ApiError, handler, ownedProject, readJson, requireApiUser } from "@/lib/apiAuth";
import { siteUrl } from "@/lib/constants";
import { fileOut, PROJECT_FIELDS } from "@/lib/cliSerialize";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FileRow } from "@/lib/types";

type Ctx = { params: Promise<{ slug: string }> };

/** GET: project with all versions and files. */
export const GET = handler(async (req, { params }: Ctx) => {
  const userId = await requireApiUser(req);
  const project = await ownedProject(userId, (await params).slug);
  const { data: versions } = await createAdminClient()
    .from("versions")
    .select("*, files(*)")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false });
  return {
    ...project,
    page_url: `${siteUrl()}/project/${project.slug}`,
    versions: (versions ?? []).map((v) => ({ ...v, files: (v.files as FileRow[]).map(fileOut) })),
  };
});

/** PATCH: update project fields. */
export const PATCH = handler(async (req, { params }: Ctx) => {
  const userId = await requireApiUser(req);
  const project = await ownedProject(userId, (await params).slug);
  const b = await readJson<Record<string, unknown>>(req);
  const patch: Record<string, unknown> = {};
  for (const k of PROJECT_FIELDS) if (k in b) patch[k] = b[k];
  if (!Object.keys(patch).length) throw new ApiError(400, `Nothing to update. Fields: ${PROJECT_FIELDS.join(", ")}`);
  const { data, error } = await createAdminClient().from("projects").update(patch).eq("id", project.id).select().single();
  if (error) throw new ApiError(400, error.message);
  return data;
});

/** DELETE: remove the project, all versions and every uploaded file. */
export const DELETE = handler(async (req, { params }: Ctx) => {
  const userId = await requireApiUser(req);
  const project = await ownedProject(userId, (await params).slug);
  const admin = createAdminClient();
  const { data: versions } = await admin.from("versions").select("files(storage_path)").eq("project_id", project.id);
  const paths = (versions ?? []).flatMap((v) => (v.files as { storage_path: string | null }[]).map((f) => f.storage_path)).filter(Boolean) as string[];
  await admin.from("projects").delete().eq("id", project.id);
  if (paths.length) await admin.storage.from("project-files").remove(paths);
  return { deleted: project.slug };
});
