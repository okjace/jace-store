/**
 * Where project files are stored (migration 012):
 *
 *   1. Cloudflare R2   while Jace Store's own R2 files are under R2_LIMIT_GB (4.5 GB by default),
 *                      so the Cloudflare account's free 10 GB also has room for its other apps
 *                      (Jace Social). Settings: R2_* (the same names Jace Social uses).
 *   2. Supabase        the project-files bucket, as before (also used when R2 isn't set up).
 *   3. Private         paid projects' files (migration 014): the private paid-files bucket. Nobody gets a
 *                      lasting link; /api/download checks the buyer and hands out a short-lived one.
 *
 * Browsers and the CLI upload straight to the chosen service with a signed URL (R2: a presigned
 * PUT; the bucket needs CORS allowing PUT from this site), then register the file. Jace Store's R2
 * files all live under R2_PREFIX ("jace-store/" by default), so a bucket shared with another app
 * works too, and only Jace Store's own files count toward the cap.
 */
import { AwsClient } from "aws4fetch";
import { createAdminClient } from "./supabase/admin";
import { safeFilename } from "./filenames";
import { siteUrl } from "./constants";

export type Provider = "supabase" | "r2" | "private";
export const PAID_BUCKET = "paid-files";
const GB = 1024 ** 3;

function r2() {
  const endpoint = (process.env.R2_ENDPOINT
    || (process.env.CLOUDFLARE_ACCOUNT_ID ? `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com` : "")).replace(/\/+$/, "");
  const { R2_ACCESS_KEY_ID: id, R2_SECRET_ACCESS_KEY: secret, R2_BUCKET: bucket } = process.env;
  const publicUrl = (process.env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
  if (!id || !secret || !bucket || !publicUrl || !endpoint) return null;
  return {
    client: new AwsClient({ accessKeyId: id, secretAccessKey: secret, service: "s3", region: "auto" }),
    endpoint, bucket, publicUrl,
    prefix: (process.env.R2_PREFIX ?? "jace-store").replace(/^\/+|\/+$/g, ""),
    cap: (Number(process.env.R2_LIMIT_GB) > 0 ? Number(process.env.R2_LIMIT_GB) : 4.5) * GB,
  };
}

const objectUrl = (c: NonNullable<ReturnType<typeof r2>>, key: string) =>
  `${c.endpoint}/${c.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

export async function r2Usage(): Promise<{ configured: boolean; bytes: number; cap: number }> {
  const c = r2();
  const { data } = await createAdminClient().from("storage_usage").select("bytes").eq("provider", "r2").maybeSingle();
  return { configured: !!c, bytes: Number(data?.bytes ?? 0), cap: c?.cap ?? 4.5 * GB };
}

/**
 * Where a new file should go and how to upload it.
 * -> { provider, path, upload_url, headers }: PUT the bytes to upload_url with those headers.
 */
export async function uploadTarget(userId: string, projectId: string, versionId: string, filename: string, size: number | null, paid = false) {
  const name = `${userId}/${projectId}/${versionId}/${safeFilename(filename)}`;
  if (paid) {
    const { data, error } = await createAdminClient().storage.from(PAID_BUCKET).createSignedUploadUrl(name, { upsert: true });
    if (error || !data) throw new Error(error?.message ?? "Couldn't create an upload URL");
    return { provider: "private" as const, path: name, upload_url: data.signedUrl, headers: { "x-upsert": "true" } as Record<string, string> };
  }
  const c = r2();
  if (c && size && size > 0) {
    const { bytes } = await r2Usage();
    if (bytes + size <= c.cap) {
      const key = `${c.prefix}/${name}`;
      const url = new URL(objectUrl(c, key));
      url.searchParams.set("X-Amz-Expires", "3600");
      const signed = await c.client.sign(url.toString(), { method: "PUT", aws: { signQuery: true } });
      return { provider: "r2" as const, path: key, upload_url: signed.url, headers: {} as Record<string, string> };
    }
  }
  const { data, error } = await createAdminClient().storage.from("project-files").createSignedUploadUrl(name, { upsert: true });
  if (error || !data) throw new Error(error?.message ?? "Couldn't create an upload URL");
  return { provider: "supabase" as const, path: name, upload_url: data.signedUrl, headers: { "x-upsert": "true" } };
}

/**
 * After the upload: check the file is really there at the expected size, count it, and give its
 * public URL. R2 files that would push Jace Store past the cap are deleted and refused.
 */
export async function confirmUpload(provider: Provider, path: string, size: number): Promise<{ url: string } | { error: string }> {
  const admin = createAdminClient();
  if (provider === "r2") {
    const c = r2();
    if (!c || !path.startsWith(`${c.prefix}/`)) return { error: "Unknown upload" };
    const head = await c.client.fetch(objectUrl(c, path), { method: "HEAD" });
    if (!head.ok) return { error: "File not found in storage. Did the upload finish?" };
    if (Number(head.headers.get("content-length")) !== size) return { error: "Uploaded size doesn't match" };
    const { data: fits } = await admin.rpc("storage_reserve", { p: "r2", n: size, cap: c.cap });
    if (!fits) {
      await c.client.fetch(objectUrl(c, path), { method: "DELETE" }).catch(() => null);
      return { error: "Jace Store's Cloudflare storage just filled up. Upload the file again (it'll go to the other storage)." };
    }
    return { url: `${c.publicUrl}/${path.split("/").map(encodeURIComponent).join("/")}` };
  }
  const bucket = provider === "private" ? PAID_BUCKET : "project-files";
  const dir = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data: listing } = await admin.storage.from(bucket).list(dir, { search: name });
  const obj = listing?.find((o) => o.name === name);
  if (!obj) return { error: "File not found in storage. Did the upload finish?" };
  if (obj.metadata?.size && Number(obj.metadata.size) !== size) return { error: "Uploaded size doesn't match" };
  // private files only get the gated download link (set once the file has its id)
  return { url: provider === "private" ? "" : admin.storage.from(bucket).getPublicUrl(path).data.publicUrl };
}

/** Delete stored files (any mix of services) and give R2's space back. Links (no path) are skipped. */
export async function removeStored(files: { storage_path: string | null; storage?: string | null; size?: number | null }[]) {
  const admin = createAdminClient();
  const supa = files.filter((f) => f.storage_path && (f.storage ?? "supabase") === "supabase").map((f) => f.storage_path!);
  for (let i = 0; i < supa.length; i += 500) await admin.storage.from("project-files").remove(supa.slice(i, i + 500));
  const priv = files.filter((f) => f.storage_path && f.storage === "private").map((f) => f.storage_path!);
  for (let i = 0; i < priv.length; i += 500) await admin.storage.from(PAID_BUCKET).remove(priv.slice(i, i + 500));
  const onR2 = files.filter((f) => f.storage_path && f.storage === "r2");
  if (!onR2.length) return;
  const c = r2();
  let freed = 0;
  for (const f of onR2) {
    const ok = c ? await c.client.fetch(objectUrl(c, f.storage_path!), { method: "DELETE" }).then((r) => r.ok || r.status === 404).catch(() => false) : false;
    if (ok) freed += Number(f.size ?? 0);
  }
  if (freed) await admin.rpc("storage_release", { p: "r2", n: freed });
}

/** The gated download link private files get (the download route checks the buyer). */
export const gatedUrl = (fileId: string) => `${siteUrl()}/api/download/${fileId}`;

/** A short-lived link to a private file, for someone allowed to download it. */
export async function privateFileUrl(path: string, filename: string): Promise<string> {
  const { data, error } = await createAdminClient().storage.from(PAID_BUCKET).createSignedUrl(path, 300, { download: filename });
  if (error || !data) throw new Error(error?.message ?? "Couldn't make a download link");
  return data.signedUrl;
}

/**
 * A project became paid: move its uploaded files into the private bucket so their old public links
 * stop working. Files on Cloudflare R2 are copied over (streamed) and their R2 space given back.
 * -> how many files moved, and any that couldn't be.
 */
export async function makeFilesPrivate(projectId: string): Promise<{ moved: number; failed: string[] }> {
  const admin = createAdminClient();
  const { data: versions } = await admin.from("versions").select("id, files(*)").eq("project_id", projectId);
  const files = (versions ?? []).flatMap((v) => (v.files ?? []) as { id: string; filename: string; storage_path: string | null; storage?: string | null; size: number | null; is_external: boolean }[])
    .filter((f) => !f.is_external && f.storage_path && f.storage !== "private");
  let moved = 0;
  const failed: string[] = [];
  for (const f of files) {
    const path = f.storage_path!;
    const prefix = f.storage === "r2" ? `${r2()?.prefix ?? "jace-store"}/` : "";
    const dest = prefix && path.startsWith(prefix) ? path.slice(prefix.length) : path;   // R2 keys carry the prefix
    try {
      if ((f.storage ?? "supabase") === "supabase") {
        const { error } = await admin.storage.from("project-files").copy(path, dest, { destinationBucket: PAID_BUCKET });
        if (error && !/exists/i.test(error.message)) throw new Error(error.message);
      } else {
        const c = r2();
        if (!c) throw new Error("Cloudflare R2 isn't set up");
        const got = await c.client.fetch(objectUrl(c, path), { method: "GET" });
        if (!got.ok || !got.body) throw new Error(`R2 ${got.status}`);
        const { data: up, error } = await admin.storage.from(PAID_BUCKET).createSignedUploadUrl(dest, { upsert: true });
        if (error || !up) throw new Error(error?.message ?? "no upload URL");
        const put = await fetch(up.signedUrl, {
          method: "PUT", body: got.body, headers: { "x-upsert": "true", "content-type": "application/octet-stream" },
          duplex: "half",
        } as RequestInit & { duplex: "half" });
        if (!put.ok) throw new Error(`upload ${put.status}`);
      }
      await admin.from("files").update({ storage: "private", storage_path: dest, url: gatedUrl(f.id) }).eq("id", f.id);
      await removeStored([{ storage_path: path, storage: f.storage ?? "supabase", size: f.size }]);
      moved++;
    } catch (e) {
      failed.push(`${f.filename}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { moved, failed };
}
