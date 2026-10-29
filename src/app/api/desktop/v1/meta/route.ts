import { json, preflight } from "@/lib/api";
import { SITE_NAME, siteUrl, typeInfo } from "@/lib/constants";
import { ARCHES, DESKTOP_TYPES, INSTALL_MODES, PLATFORMS } from "@/lib/fileFormats";

export const OPTIONS = preflight;

/** GET /api/desktop/v1/meta — types, categories and platforms for the app's filters. */
export async function GET() {
  return json({
    name: SITE_NAME,
    api_version: 1,
    site_url: siteUrl(),
    types: DESKTOP_TYPES.map((id) => {
      const t = typeInfo(id);
      return { id, label: t.label, plural: t.plural, icon: t.icon, platforms: t.loaders, categories: t.categories };
    }),
    platforms: PLATFORMS,
    arches: ARCHES,
    install_modes: INSTALL_MODES,
  }, { cache: 3600 });
}
