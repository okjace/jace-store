import { guardPost } from "@/lib/accountModeration";
import { ApiError, handler, ownedProject, readJson, requireApiUser } from "@/lib/apiAuth";
import { siteUrl, slugify } from "@/lib/constants";
import { isOwnImage } from "@/lib/images";
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
  // pictures must be ones this person uploaded to Jace Store's own storage
  const newImages: string[] = [];
  if ("icon_url" in patch && patch.icon_url !== project.icon_url) {
    if (patch.icon_url !== null && !isOwnImage(userId, patch.icon_url)) throw new ApiError(400, "icon_url must be a picture you uploaded");
    if (patch.icon_url) newImages.push(String(patch.icon_url));
  }
  if ("gallery" in patch) {
    if (!Array.isArray(patch.gallery)) throw new ApiError(400, "gallery must be a list of picture URLs");
    const old: string[] = project.gallery ?? [];
    const g = (patch.gallery as unknown[]).map(String).slice(0, 8);
    for (const u of g) if (!old.includes(u)) {
      if (!isOwnImage(userId, u)) throw new ApiError(400, "Screenshots must be pictures you uploaded");
      newImages.push(u);
    }
    patch.gallery = g;
  }
  if ("categories" in patch) patch.categories = Array.isArray(patch.categories) ? (patch.categories as unknown[]).map(String) : [];
  if ("title" in patch && String(patch.title ?? "").trim().length < 2) throw new ApiError(400, "title is required");
  if ("slug" in b) {
    const slug = slugify(String(b.slug ?? ""));
    if (slug.length < 2) throw new ApiError(400, "slug is too short");
    patch.slug = slug;
  }
  await guardPost(userId, "project", {
    names: [patch.title as string, patch.slug as string],
    texts: [patch.summary as string, patch.description as string],
    image: newImages.length ? "post" : null,
  });
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
  if (error) throw new ApiError(400, error.code === "23505" ? "That URL slug is taken. Pick another." : error.message);
  return data;
});

/** DELETE: remove the project, all versions and every uploaded file. */
export const DELETE = handler(async (req, { params }: Ctx) => {
  const userId = await requireApiUser(req);
  const project = await ownedProject(userId, (await params).slug);
  await deleteProjectCompletely(project.id);
  return { deleted: project.slug };
});
