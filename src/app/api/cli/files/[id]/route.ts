import { guardPost } from "@/lib/accountModeration";
import { ApiError, handler, ownedVersion, readJson, requireApiUser } from "@/lib/apiAuth";
import { fileOut } from "@/lib/cliSerialize";
import { installFields } from "@/lib/fileFormats";
import { createAdminClient } from "@/lib/supabase/admin";

/** DELETE: remove one file (upload or link) from a version. */
export const DELETE = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireApiUser(req);
  const { id } = await params;
  const admin = createAdminClient();
  const { data: file } = await admin.from("files").select("id, version_id, storage_path").eq("id", id).maybeSingle();
  if (!file) throw new ApiError(404, "File not found");
  await ownedVersion(userId, file.version_id);
  await admin.from("files").delete().eq("id", file.id);
  if (file.storage_path) await admin.storage.from("project-files").remove([file.storage_path]);
  return { deleted: file.id };
});

/** PATCH { primary?: true, label?: string|null, filename?: string, install_mode?, platform?, arch? } */
export const PATCH = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireApiUser(req);
  const { id } = await params;
  const admin = createAdminClient();
  const { data: file } = await admin.from("files").select("id, version_id").eq("id", id).maybeSingle();
  if (!file) throw new ApiError(404, "File not found");
  await ownedVersion(userId, file.version_id);
  const b = await readJson<Record<string, unknown>>(req);
  await guardPost(userId, "file", { names: [b.label as string, b.filename as string] });
  const patch: Record<string, unknown> = {};
  if ("label" in b) patch.label = b.label ? String(b.label).trim().slice(0, 80) : null;
  if (typeof b.filename === "string" && b.filename.trim()) patch.filename = b.filename.trim().slice(0, 200);
  const inst = installFields(b);
  if ("error" in inst) throw new ApiError(400, inst.error);
  Object.assign(patch, inst.patch);
  if (b.primary === true) {
    await admin.from("files").update({ is_primary: false }).eq("version_id", file.version_id);
    patch.is_primary = true;
  }
  if (!Object.keys(patch).length) throw new ApiError(400, "Nothing to update (primary, label, filename, install_mode, platform, arch)");
  const { data, error } = await admin.from("files").update(patch).eq("id", file.id).select().single();
  if (error) throw new ApiError(400, error.message);
  return fileOut(data);
});
