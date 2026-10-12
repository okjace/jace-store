import { json, preflight } from "@/lib/api";
import { SITE_NAME, siteUrl } from "@/lib/constants";
import { MC_TYPE_IDS } from "@/lib/launcherApi";

export const OPTIONS = preflight;

const str = { type: "string" };
const strs = { type: "array", items: str };
const q = (name: string, description: string, schema: object = str) => ({ name, in: "query", required: false, description, schema });
const slug = { name: "slug", in: "path", required: true, description: "Project slug or id", schema: str };
const instance = [
  q("loader", "Instance loader, e.g. fabric, neoforge, iris"),
  q("game_version", "Minecraft version, e.g. 1.21.1"),
  q("channel", "release = releases only, beta = releases + betas, omit = all", { type: "string", enum: ["release", "beta", "alpha"] }),
];
const ok = (description: string, ref: string) => ({ 200: { description, content: { "application/json": { schema: { $ref: `#/components/schemas/${ref}` } } } } });

/** GET /api/launcher/v1/openapi.json — machine-readable spec (OpenAPI 3.1). */
export async function GET() {
  const File = {
    type: "object",
    properties: {
      id: str, filename: str, label: { type: ["string", "null"] }, primary: { type: "boolean" }, external: { type: "boolean" },
      size: { type: ["integer", "null"] },
      hashes: { type: ["object", "null"], properties: { sha1: str, sha512: str } },
      url: { ...str, description: "Counts the download and redirects" }, direct_url: str,
    },
  };
  const Version = {
    type: "object",
    properties: {
      id: str, project_id: str, name: str, version_number: str, channel: str, loaders: strs, game_versions: strs,
      changelog: str, downloads: { type: "integer" }, published_at: str, files: { type: "array", items: { $ref: "#/components/schemas/File" } },
    },
  };
  const Hit = {
    type: "object",
    properties: {
      id: str, slug: str, type: { type: "string", enum: MC_TYPE_IDS }, edition: { type: "string", enum: ["java", "bedrock"] }, title: str, summary: str, icon_url: { type: ["string", "null"] },
      author: { type: ["string", "null"] }, downloads: { type: "integer" }, categories: strs, loaders: strs, game_versions: strs,
      created_at: str, updated_at: str, page_url: str,
    },
  };
  return json({
    openapi: "3.1.0",
    info: {
      title: `${SITE_NAME} Launcher API`,
      version: "1",
      description: "Read-only, public, CORS-enabled API for Minecraft launchers to browse, install and update content from the store.",
    },
    servers: [{ url: `${siteUrl()}/api/launcher/v1` }],
    paths: {
      "/meta": { get: { summary: "Types, loaders, categories and game versions for filter UI", responses: { 200: { description: "Metadata" } } } },
      "/search": {
        get: {
          summary: "Search Minecraft content",
          parameters: [
            q("q", "Search text"), q("type", `Comma list of: ${MC_TYPE_IDS.join(", ")}`), q("loader", "Comma list, any match"),
            q("game_version", "Minecraft version (Java or Bedrock numbering, matching the type)"), q("category", "Comma list, any match"),
            q("edition", "Which Minecraft when no type is given. Default java", { type: "string", enum: ["java", "bedrock", "all"] }),
            q("sort", "Sort order", { type: "string", enum: ["downloads", "updated", "newest", "title"] }),
            q("page", "1-based page", { type: "integer" }), q("limit", "1-50, default 20", { type: "integer" }),
          ],
          responses: ok("Search results", "SearchResult"),
        },
      },
      "/featured": { get: { summary: "Popular, recently updated and newest projects", parameters: [q("type", "Comma list of types"), q("edition", "java (default), bedrock or all", { type: "string", enum: ["java", "bedrock", "all"] }), q("limit", "1-30", { type: "integer" })], responses: { 200: { description: "Rows" } } } },
      "/project/{slug}": { get: { summary: "Project details with the featured version", parameters: [slug], responses: { 200: { description: "Project" }, 404: { description: "Not found or not Minecraft content" } } } },
      "/project/{slug}/versions": { get: { summary: "Versions, filterable for an instance", parameters: [slug, ...instance], responses: { 200: { description: "Versions", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Version" } } } } } } } },
      "/project/{slug}/resolve": { get: { summary: "Best version + file + install path for an instance", parameters: [slug, ...instance], responses: { 200: { description: "Resolved install" }, 404: { description: "No compatible version" } } } },
      "/updates": {
        post: {
          summary: "Identify installed files by hash and check for updates",
          requestBody: { content: { "application/json": { schema: { type: "object", required: ["hashes"], properties: {
            hashes: strs, algorithm: { type: "string", enum: ["sha1", "sha512"] }, loader: str, game_version: str, channel: str,
          } } } } },
          responses: { 200: { description: "{ results: { <hash>: { project, current_version, update_available, latest_version, latest_file } } }" } },
        },
      },
    },
    components: {
      schemas: {
        File, Version, Hit,
        SearchResult: { type: "object", properties: { hits: { type: "array", items: { $ref: "#/components/schemas/Hit" } }, total: { type: "integer" }, page: { type: "integer" }, limit: { type: "integer" }, pages: { type: "integer" } } },
      },
    },
  }, { cache: 3600 });
}
