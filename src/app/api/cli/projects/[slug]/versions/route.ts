import { guardPost } from "@/lib/accountModeration";
import { ApiError, handler, ownedProject, readJson, requireApiUser } from "@/lib/apiAuth";
import { addLinkFile, type LinkInput } from "@/lib/linkFiles";
import { parseDependencies } from "@/lib/dependencies";
import { fileOut } from "@/lib/cliSerialize";
import { siteUrl, typeInfo } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

/**
 * POST: create a version.
 * Body: { version_number, name?, changelog?, channel?: release|beta|alpha,
 *         loaders?: [], game_versions?: [], links?: LinkInput[],
 *         dependencies?: ["modrinth:fabric-api", "e4all", {source, project, type}] }
 * Upload files afterwards with /api/cli/versions/{id}/upload-url + /files.
 */
export const POST = handler(async (req, { params }: { params: Promise<{ slug: string }> }) => {
  const userId = await requireApiUser(req);
  const project = await ownedProject(userId, (await params).slug);
  const b = await readJson<Record<string, unknown>>(req);
  const versionNumber = String(b.version_number ?? "").trim();
  if (!versionNumber) throw new ApiError(400, "version_number is required");
  const channel = String(b.channel ?? "release");
  if (!["release", "beta", "alpha"].includes(channel)) throw new ApiError(400, "channel must be release, beta or alpha");
  const gameVersions = Array.isArray(b.game_versions) ? b.game_versions.map(String) : [];
  if (typeInfo(project.type).minecraft && !gameVersions.length) {
    throw new ApiError(400, "game_versions is required for Minecraft content, e.g. [\"1.21.1\"]");
  }

  const dependencies = b.dependencies == null ? [] : parseDependencies(b.dependencies);
  await guardPost(userId, "version", { names: [versionNumber, String(b.name ?? "")], texts: [String(b.changelog ?? "")] });

  const admin = createAdminClient();
  const { data: version, error } = await admin
    .from("versions")
    .insert({
      ...(dependencies.length ? { dependencies } : {}),
      project_id: project.id,
      version_number: versionNumber,
      name: String(b.name ?? "").trim() || versionNumber,
      changelog: String(b.changelog ?? ""),
      release_channel: channel,
      loaders: Array.isArray(b.loaders) ? b.loaders.map(String) : [],
      game_versions: gameVersions,
    })
    .select()
    .single();
  if (error) throw new ApiError(400, error.code === "23505" ? `Version ${versionNumber} already exists` : error.message);

  const files = [];
  try {
    for (const link of (Array.isArray(b.links) ? b.links : []) as LinkInput[]) {
      files.push(fileOut(await addLinkFile({ id: version.id, project }, link)));
    }
  } catch (e) {
    await admin.from("versions").delete().eq("id", version.id);
    throw e;
  }
  return { ...version, files, page_url: `${siteUrl()}/project/${project.slug}` };
});
