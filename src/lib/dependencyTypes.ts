// Dependency types shared by the server and the browser (no server-only imports here).

export const DEP_SOURCES = ["jace", "modrinth"] as const;
export const DEP_TYPES = ["required", "optional", "incompatible", "embedded"] as const;

export interface Dependency {
  /** Where the project lives: Jace Store or Modrinth. */
  source: (typeof DEP_SOURCES)[number];
  /** Project slug on that site. */
  project: string;
  type: (typeof DEP_TYPES)[number];
}

export function dependencyUrl(d: Dependency) {
  return d.source === "modrinth" ? `https://modrinth.com/project/${d.project}` : `/project/${d.project}`;
}
