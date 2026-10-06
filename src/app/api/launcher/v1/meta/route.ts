import { json, preflight } from "@/lib/api";
import { GAME_VERSIONS, SITE_NAME, siteUrl } from "@/lib/constants";
import { MC_TYPES } from "@/lib/launcherApi";

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
      install_directory: t.installDir,
      loader_label: t.loaderLabel,
      loaders: t.loaders,
      categories: t.categories,
      file_extensions: t.accept.split(","),
    })),
    game_versions: GAME_VERSIONS,
    sorts: ["downloads", "updated", "newest", "title"],
    channels: ["release", "beta", "alpha"],
  }, { cache: 3600 });
}
