import { ApiError } from "./apiAuth";

import { DEP_SOURCES, DEP_TYPES, SLUG, githubRepo, linkedProject, type Dependency } from "./dependencyTypes";

export { DEP_SOURCES, DEP_TYPES, dependencyUrl, type Dependency } from "./dependencyTypes";

/**
 * Accepts [{source, project, type}] or short strings like "modrinth:fabric-api",
 * "e4all" (Jace Store), "modrinth:sodium:optional", "github:owner/repo" or a GitHub link
 * ("https://github.com/owner/repo", optionally followed by ":optional"), "curseforge:jei", or a
 * Modrinth / CurseForge link.
 */
export function parseDependencies(input: unknown): Dependency[] {
  if (!Array.isArray(input)) throw new ApiError(400, "dependencies must be a list");
  if (input.length > 50) throw new ApiError(400, "At most 50 dependencies");
  const out: Dependency[] = [];
  for (const raw of input) {
    let d: Record<string, unknown>;
    if (typeof raw === "string" && /^(?:github:|(?:https?:\/\/)?(?:www\.)?github\.com\/)/i.test(raw.trim())) {
      const m = raw.trim().replace(/^github:/i, "").match(/^(.*?)(?::(required|optional|incompatible|embedded))?$/)!;
      d = { source: "github", project: m[1], type: m[2] };
    } else if (typeof raw === "string" && linkedProject(raw.replace(/:(required|optional|incompatible|embedded)$/, ""))) {
      const type = raw.match(/:(required|optional|incompatible|embedded)$/)?.[1];
      d = { ...linkedProject(raw.replace(/:(required|optional|incompatible|embedded)$/, ""))!, type };
    } else if (typeof raw === "string") {
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
    let project = String(d.project ?? "").trim();
    const type = String(d.type ?? "required");
    if (!DEP_SOURCES.includes(source as Dependency["source"])) throw new ApiError(400, `Unknown dependency source "${source}" (use jace, modrinth, curseforge or github)`);
    if (source === "github") {
      const repo = githubRepo(project);
      if (!repo) throw new ApiError(400, `"${project}" isn't a GitHub repository (use owner/repo)`);
      project = repo;
    } else {
      project = project.toLowerCase();
      if (!SLUG.test(project)) throw new ApiError(400, `"${project}" isn't a valid project slug`);
    }
    if (!DEP_TYPES.includes(type as Dependency["type"])) throw new ApiError(400, `Dependency type must be one of ${DEP_TYPES.join(", ")}`);
    if (!out.some((o) => o.source === source && o.project.toLowerCase() === project.toLowerCase())) {
      out.push({ source: source as Dependency["source"], project, type: type as Dependency["type"] });
    }
  }
  return out;
}
