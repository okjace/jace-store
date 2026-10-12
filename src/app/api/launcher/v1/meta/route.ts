import { json, preflight } from "@/lib/api";
import { BEDROCK_VERSIONS, GAME_VERSIONS, SITE_NAME, siteUrl, versionsFor } from "@/lib/constants";
import { editionOf, installMethod, MC_TYPES } from "@/lib/launcherApi";

export const OPTIONS = preflight;

/** GET /api/launcher/v1/meta — everything a launcher needs to build filter UI. */
export async function GET() {
  return json({
    name: SITE_NAME,
    api_version: 1,
    site_url: siteUrl(),
    docs_url: `${siteUrl()}/developers/launchers`,
    types: MC_TYPES.map((t) => ({
      id: t.id,
      label: t.label,
      plural: t.plural,
      edition: editionOf(t.id),
      install_method: installMethod(t.id),
      install_directory: t.installDir,
      loader_label: t.loaderLabel,
      loaders: t.loaders,
      categories: t.categories,
      file_extensions: t.accept.split(","),
      /** Version list that applies to this type (Java or Bedrock numbering). */
      game_versions: versionsFor(t.id),
    })),
    editions: ["java", "bedrock"],
    /** Java Edition versions (kept for older clients). */
    game_versions: GAME_VERSIONS,
    bedrock_game_versions: BEDROCK_VERSIONS,
    sorts: ["downloads", "updated", "newest", "title"],
    channels: ["release", "beta", "alpha"],
  }, { cache: 3600 });
}
