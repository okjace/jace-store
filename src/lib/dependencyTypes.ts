// Dependency types shared by the server and the browser (no server-only imports here).

export const DEP_SOURCES = ["jace", "modrinth", "github"] as const;
export const DEP_TYPES = ["required", "optional", "incompatible", "embedded"] as const;

export interface Dependency {
  /** Where the project lives: Jace Store, Modrinth or a GitHub repository. */
  source: (typeof DEP_SOURCES)[number];
  /** Project slug on that site; for GitHub "owner/repo". */
  project: string;
  type: (typeof DEP_TYPES)[number];
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

export function dependencyUrl(d: Dependency) {
  if (d.source === "modrinth") return `https://modrinth.com/project/${d.project}`;
  if (d.source === "github") return `https://github.com/${d.project}`;
  return `/project/${d.project}`;
}
