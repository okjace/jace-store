import JSZip from "jszip";
import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/server";
import { badRequest, CORS, UUID_RE } from "@/lib/api";
import { typeInfo } from "@/lib/constants";
import type { FileRow } from "@/lib/types";

const LOADER_KEYS: Record<string, string> = {
  fabric: "fabric-loader",
  quilt: "quilt-loader",
  forge: "forge",
  neoforge: "neoforge",
};

/**
 * GET /api/mrpack?v=<versionId>,<versionId>&name=My+Pack&mc=1.21.1&loader=fabric&loader_version=0.16.14
 * Builds a Modrinth-format modpack (.mrpack) that Prism Launcher, ATLauncher and
 * the Modrinth App can import. Files are referenced by URL (uploads or custom links), not embedded.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const ids = (sp.get("v") ?? "").split(",").filter((s) => UUID_RE.test(s)).slice(0, 300);
  const name = (sp.get("name") || "Jace Store Pack").slice(0, 80);
  const mc = sp.get("mc") ?? "";
  const loader = sp.get("loader") ?? "";
  const loaderVersion = sp.get("loader_version") ?? "";
  if (!ids.length) return badRequest("Pass at least one version id in ?v=");
  if (!/^\d+\.\d+(\.\d+)?$/.test(mc)) return badRequest("mc must be a Minecraft version like 1.21.1");
  if (loader && !LOADER_KEYS[loader]) return badRequest(`loader must be one of ${Object.keys(LOADER_KEYS).join(", ")}`);
  if (loader && !/^[\w.+-]{1,64}$/.test(loaderVersion)) return badRequest("loader_version is required when loader is set");

  const { data, error } = await createPublicClient()
    .from("versions")
    .select("id, files(*), project:projects(type, slug)")
    .in("id", ids);
  if (error) return badRequest(error.message);

  const files = [];
  for (const v of (data ?? []) as unknown as { files: FileRow[]; project: { type: string; slug: string } }[]) {
    // Launchers verify every file, so only files with known hashes can go in a pack.
    const verified = v.files.filter((x) => x.sha1 && x.sha512 && x.size);
    const f = verified.find((x) => x.is_primary) ?? verified[0];
    const dir = typeInfo(v.project.type).installDir;
    if (!f || !dir || !["mod", "resourcepack", "shader"].includes(v.project.type)) continue;
    const clientOnly = v.project.type !== "mod";
    files.push({
      path: `${dir}/${f.filename.replace(/[\\/]/g, "_")}`,
      hashes: { sha1: f.sha1, sha512: f.sha512 },
      env: { client: "required", server: clientOnly ? "unsupported" : "required" },
      downloads: [f.url],
      fileSize: f.size!,
    });
  }

  const dependencies: Record<string, string> = { minecraft: mc };
  if (loader) dependencies[LOADER_KEYS[loader]] = loaderVersion;

  const zip = new JSZip();
  zip.file(
    "modrinth.index.json",
    JSON.stringify({ formatVersion: 1, game: "minecraft", versionId: "1.0.0", name, summary: `Built on Jace Store`, files, dependencies }, null, 2)
  );
  zip.folder("overrides");
  const body = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  const filename = `${name.replace(/[^\w.-]+/g, "_")}.mrpack`;

  return new NextResponse(body as unknown as BodyInit, {
    headers: {
      ...CORS,
      "Content-Type": "application/x-modrinth-modpack+zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
