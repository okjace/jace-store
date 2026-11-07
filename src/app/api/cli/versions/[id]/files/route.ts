import { guardPost } from "@/lib/accountModeration";
import { ApiError, handler, ownedVersion, readJson, requireApiUser } from "@/lib/apiAuth";
import { addLinkFile, type LinkInput } from "@/lib/linkFiles";
import { fileOut } from "@/lib/cliSerialize";
import { installFields } from "@/lib/fileFormats";
import { confirmUpload } from "@/lib/fileStorage";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

/**
 * POST: attach a file to a version.
 *  { kind: "link", url, filename?, label?, primary?, sha1?, sha512?, size?, skip_hash? }
 *  { kind: "upload", path, filename, sha1, sha512, size, label?, primary? }   (after PUT to upload_url)
 *  Both also take install_mode (auto|install|open), platform and arch for the desktop app.
 */
export const POST = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireApiUser(req);
  const v = await ownedVersion(userId, (await params).id);
  const b = await readJson<Record<string, unknown>>(req);
  await guardPost(userId, "file", { names: [b.label as string, b.filename as string] });

  if (b.kind === "link" || (!b.kind && b.url)) return fileOut(await addLinkFile(v, b as unknown as LinkInput));

  if (b.kind !== "upload") throw new ApiError(400, 'kind must be "link" or "upload"');
  const inst = installFields(b);
  if ("error" in inst) throw new ApiError(400, inst.error);
  const path = String(b.path ?? "");
  const provider = b.provider === "r2" ? "r2" : "supabase";
  const mine = `${userId}/${v.project.id}/${v.id}/`;
  if (!(provider === "r2" ? path.includes(`/${mine}`) : path.startsWith(mine)) || path.includes("..")) {
    throw new ApiError(400, "path doesn't belong to this version");
  }
  const sha1 = String(b.sha1 ?? "").toLowerCase();
  const sha512 = String(b.sha512 ?? "").toLowerCase();
  const size = Number(b.size);
  if (!/^[0-9a-f]{40}$/.test(sha1) || !/^[0-9a-f]{128}$/.test(sha512) || !(size > 0)) {
    throw new ApiError(400, "upload needs sha1, sha512 and size");
  }
  const admin = createAdminClient();
  const name = path.slice(path.lastIndexOf("/") + 1);
  const confirmed = await confirmUpload(provider, path, size);
  if ("error" in confirmed) throw new ApiError(400, confirmed.error);

  if (b.primary) await admin.from("files").update({ is_primary: false }).eq("version_id", v.id);
  const { count } = await admin.from("files").select("id", { count: "exact", head: true }).eq("version_id", v.id);
  const url = confirmed.url;
  const { data, error } = await admin
    .from("files")
    .upsert({
      version_id: v.id,
      filename: String(b.filename ?? name),
      label: (b.label as string) || null,
      storage_path: path,
      ...(provider === "r2" ? { storage: "r2" } : {}),
      url,
      size,
      sha1,
      sha512,
      is_external: false,
      ...inst.patch,
      is_primary: (b.primary as boolean) ?? (count ?? 0) === 0,
    }, { onConflict: "storage_path" })
    .select()
    .single();
  if (error) throw new ApiError(400, error.message);
  return fileOut(data);
});
