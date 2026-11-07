// Dependency types shared by the server and the browser (no server-only imports here).

export const DEP_SOURCES = ["jace", "modrinth", "curseforge", "github"] as const;
export const DEP_TYPES = ["required", "optional", "incompatible", "embedded"] as const;
/** Sources that "dependencies for every version" can pick matching releases from. */
export const AUTO_SOURCES = ["modrinth", "curseforge"] as const;

export interface Dependency {
  /** Where the project lives: Jace Store, Modrinth, CurseForge or a GitHub repository. */
  source: (typeof DEP_SOURCES)[number];
  /** Project slug on that site; for GitHub "owner/repo". */
  project: string;
  type: (typeof DEP_TYPES)[number];
  /** Set by Jace Store for dependencies for every version (never from users): */
  auto?: boolean;
  /** The project's id there (Modrinth project id, CurseForge mod id). */
  project_id?: string;
  /** The matching release (Modrinth version id, CurseForge file id) and its name, if one was found. */
  version_id?: string;
  version_name?: string;
  /** Project page (CurseForge pages depend on the kind of project). */
  url?: string;
}

/** A project's "dependencies for every version" entry (projects.auto_dependencies). */
export interface AutoDependency {
  source: (typeof AUTO_SOURCES)[number];
  project: string;
  type: (typeof DEP_TYPES)[number];
  project_id: string;
  title: string;
  url: string;
}

export const GITHUB_REPO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
export const SLUG = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** "owner/repo" from "owner/repo", "github.com/owner/repo" or a full GitHub link (null if it isn't one). */
export function githubRepo(input: string): string | null {
  const s = input.trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, "")
    .replace(/\.git$/i, "")
    .split(/[?#]/)[0];
  const [owner, repo] = s.split("/").filter(Boolean);
  const r = owner && repo ? `${owner}/${repo}` : "";
  return GITHUB_REPO.test(r) && repo !== "." && repo !== ".." ? r : null;
}

/** A project's slug from a Modrinth or CurseForge link (null if it isn't one). */
export function linkedProject(input: string): { source: "modrinth" | "curseforge"; project: string } | null {
  const m = input.trim().match(/^(?:https?:\/\/)?(?:www\.)?(modrinth\.com|curseforge\.com)\/(?:minecraft\/)?[a-z-]+\/([A-Za-z0-9._-]+)/i);
  if (!m) return null;
  const project = m[2].toLowerCase();
  if (!SLUG.test(project)) return null;
  return { source: m[1].toLowerCase().startsWith("modrinth") ? "modrinth" : "curseforge", project };
}

export function dependencyUrl(d: Dependency) {
  if (d.source === "modrinth") return `https://modrinth.com/project/${d.project}${d.version_id ? `/version/${d.version_id}` : ""}`;
  if (d.source === "curseforge") {
    const page = d.url?.startsWith("https://www.curseforge.com/") ? d.url : `https://www.curseforge.com/minecraft/mc-mods/${d.project}`;
    return d.version_id ? `${page}/files/${d.version_id}` : page;
  }
  if (d.source === "github") return `https://github.com/${d.project}`;
  return `/project/${d.project}`;
}

export const SOURCE_LABELS: Record<Dependency["source"], string> = {
  jace: "Jace Store", modrinth: "Modrinth", curseforge: "CurseForge", github: "GitHub",
};
