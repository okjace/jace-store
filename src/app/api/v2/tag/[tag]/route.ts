import { GAME_VERSIONS, PROJECT_TYPES } from "@/lib/constants";
import { json, notFound, preflight } from "@/lib/api";

export const OPTIONS = preflight;

/** GET /api/v2/tag/{game_version|loader|project_type|category} */
export async function GET(_req: Request, { params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  const cache = 3600;
  switch (tag) {
    case "game_version":
      return json(GAME_VERSIONS.map((version) => ({ version, version_type: "release", date: null, major: version.split(".").length === 2 })), { cache });
    case "loader": {
      const map = new Map<string, Set<string>>();
      for (const t of PROJECT_TYPES) for (const l of t.loaders) (map.get(l) ?? map.set(l, new Set()).get(l)!).add(t.id);
      return json([...map].map(([name, types]) => ({ name, icon: "", supported_project_types: [...types] })), { cache });
    }
    case "project_type":
      return json(PROJECT_TYPES.map((t) => t.id), { cache });
    case "category":
      return json(PROJECT_TYPES.flatMap((t) => t.categories.map((name) => ({ name, project_type: t.id, header: "categories", icon: "" }))), { cache });
    default:
      return notFound("tag");
  }
}
