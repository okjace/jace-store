import { ApiError, handler, ownedProject, readJson, requireApiUser } from "@/lib/apiAuth";
import { siteUrl } from "@/lib/constants";
import { fileOut, PROJECT_FIELDS } from "@/lib/cliSerialize";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteProjectCompletely } from "@/lib/moderation";
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
  const admin = createAdminClient();
  if ("download_mode" in patch && !["latest", "primary", "all"].includes(String(patch.download_mode))) {
    throw new ApiError(400, "download_mode must be latest, primary or all");
  }
  if (patch.primary_version_id) {
    const { data: v } = await admin.from("versions").select("id")
      .eq("id", String(patch.primary_version_id)).eq("project_id", project.id).maybeSingle();
    if (!v) throw new ApiError(400, "primary_version_id must be a version of this project");
    if (!("download_mode" in patch)) patch.download_mode = "primary";
  }
  if (patch.download_mode === "primary" && !(patch.primary_version_id ?? project.primary_version_id)) {
    throw new ApiError(400, "Pick a primary_version_id for download_mode=primary");
  }
  const { data, error } = await admin.from("projects").update(patch).eq("id", project.id).select().single();
  if (error) throw new ApiError(400, error.message);
  return data;
});

/** DELETE: remove the project, all versions and every uploaded file. */
export const DELETE = handler(async (req, { params }: Ctx) => {
  const userId = await requireApiUser(req);
  const project = await ownedProject(userId, (await params).slug);
  await deleteProjectCompletely(project.id);
  return { deleted: project.slug };
});
