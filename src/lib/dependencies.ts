import { ApiError } from "./apiAuth";

import { DEP_SOURCES, DEP_TYPES, type Dependency } from "./dependencyTypes";

export { DEP_SOURCES, DEP_TYPES, dependencyUrl, type Dependency } from "./dependencyTypes";

/**
 * Accepts [{source, project, type}] or short strings like "modrinth:fabric-api",
 * "e4all" (Jace Store) or "modrinth:sodium:optional".
 */
export function parseDependencies(input: unknown): Dependency[] {
  if (!Array.isArray(input)) throw new ApiError(400, "dependencies must be a list");
  if (input.length > 50) throw new ApiError(400, "At most 50 dependencies");
  const out: Dependency[] = [];
  for (const raw of input) {
    let d: Record<string, unknown>;
    if (typeof raw === "string") {
      const parts = raw.trim().split(":");
      if (parts.length === 1) d = { source: "jace", project: parts[0] };
      else if (DEP_SOURCES.includes(parts[0] as Dependency["source"])) d = { source: parts[0], project: parts[1], type: parts[2] };
      else d = { source: "jace", project: parts[0], type: parts[1] };
    } else if (raw && typeof raw === "object") {
      d = raw as Record<string, unknown>;
    } else {
      throw new ApiError(400, "Each dependency must be a string or an object");
    }
    const source = String(d.source ?? "jace");
    const project = String(d.project ?? "").trim().toLowerCase();
    const type = String(d.type ?? "required");
    if (!DEP_SOURCES.includes(source as Dependency["source"])) throw new ApiError(400, `Unknown dependency source "${source}" (use jace or modrinth)`);
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(project)) throw new ApiError(400, `"${project}" isn't a valid project slug`);
    if (!DEP_TYPES.includes(type as Dependency["type"])) throw new ApiError(400, `Dependency type must be one of ${DEP_TYPES.join(", ")}`);
    if (!out.some((o) => o.source === source && o.project === project)) {
      out.push({ source: source as Dependency["source"], project, type: type as Dependency["type"] });
    }
  }
  return out;
}
