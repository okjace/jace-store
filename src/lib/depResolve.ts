/**
 * Dependencies for every version (migration 013). A project lists Modrinth / CurseForge mods once
 * (projects.auto_dependencies); each of its versions then gets the release of each mod that fits
 * its Minecraft versions and loaders, as a dependency marked `auto` with that release's id. This
 * runs when the list is saved (for every version), when a version is created, and when a version's
 * Minecraft versions or loaders change.
 *
 * CurseForge needs an API key (CURSEFORGE_API_KEY, from console.curseforge.com).
 */
import { ApiError } from "./apiAuth";
import { siteUrl } from "./constants";
import { AUTO_SOURCES, DEP_TYPES, SLUG, linkedProject, type AutoDependency, type Dependency } from "./dependencyTypes";
import { createAdminClient } from "./supabase/admin";

const CF_API = "https://api.curseforge.com/v1";
const CF_MINECRAFT = 432;
const CF_MODS = 6;
const CF_LOADERS: Record<string, number> = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };
const CHANNEL_RANK: Record<string, number> = { release: 0, beta: 1, alpha: 2 };

export const curseforgeReady = () => !!process.env.CURSEFORGE_API_KEY;

async function getJson(url: string, headers: Record<string, string>, site: string) {
  const r = await fetch(url, { headers: { accept: "application/json", ...headers }, cache: "no-store", signal: AbortSignal.timeout(15000) })
    .catch(() => null);
  if (!r) throw new ApiError(502, `${site} didn't answer. Try again in a minute.`);
  if (r.status === 404) return null;
  if (!r.ok) throw new ApiError(502, `${site} didn't answer (${r.status}). Try again in a minute.`);
  return r.json();
}

const modrinth = (path: string) =>
  getJson(`https://api.modrinth.com/v2${path}`, { "user-agent": `jace-store (${siteUrl()})` }, "Modrinth");

function curseforge(path: string) {
  const key = process.env.CURSEFORGE_API_KEY;
  if (!key) throw new ApiError(503, "CurseForge isn't set up on Jace Store yet (it needs a CurseForge API key).");
  return getJson(`${CF_API}${path}`, { "x-api-key": key }, "CurseForge");
}

/** Look a project up on Modrinth or CurseForge (slug, id or link). Null if it doesn't exist. */
export async function findDepProject(source: AutoDependency["source"], input: string): Promise<Omit<AutoDependency, "type"> | null> {
  const project = (linkedProject(input)?.project ?? input).trim().toLowerCase();
  if (!SLUG.test(project)) return null;
  if (source === "modrinth") {
    const p = await modrinth(`/project/${encodeURIComponent(project)}`);
    return p ? { source, project: p.slug, project_id: p.id, title: p.title, url: `https://modrinth.com/project/${p.slug}` } : null;
  }
  let m: { id: number; slug: string; name: string; classId?: number; links?: { websiteUrl?: string } } | undefined;
  if (/^\d+$/.test(project)) {
    m = (await curseforge(`/mods/${project}`))?.data;
  } else {
    const found = (await curseforge(`/mods/search?gameId=${CF_MINECRAFT}&slug=${encodeURIComponent(project)}`))?.data ?? [];
    m = found.find((x: { classId?: number }) => x.classId === CF_MODS) ?? found[0];
  }
  if (!m) return null;
  const web = m.links?.websiteUrl;
  const url = typeof web === "string" && web.startsWith("https://www.curseforge.com/") ? web.replace(/\/+$/, "")
    : `https://www.curseforge.com/minecraft/mc-mods/${m.slug}`;
  return { source, project: m.slug, project_id: String(m.id), title: m.name, url };
}

/** Parse and look up a new "dependencies for every version" list. */
export async function parseAutoDependencies(input: unknown): Promise<AutoDependency[]> {
  if (!Array.isArray(input)) throw new ApiError(400, "dependencies must be a list");
  if (input.length > 20) throw new ApiError(400, "At most 20 dependencies for every version");
  const out: AutoDependency[] = [];
  for (const raw of input) {
    let source: string, project: string, type: string | undefined;
    if (typeof raw === "string") {
      const t = raw.trim().match(/^(.*?)(?::(required|optional|incompatible|embedded))?$/)!;
      const link = linkedProject(t[1]);
      const parts = t[1].split(":");
      [source, project] = link ? [link.source, link.project] : parts.length > 1 ? [parts[0], parts[1]] : ["modrinth", parts[0]];
      type = t[2];
    } else if (raw && typeof raw === "object") {
      const r = raw as Record<string, unknown>;
      source = String(r.source ?? "modrinth"); project = String(r.project ?? ""); type = r.type ? String(r.type) : undefined;
    } else {
      throw new ApiError(400, "Each dependency must be a string or an object");
    }
    if (!AUTO_SOURCES.includes(source as AutoDependency["source"])) throw new ApiError(400, `Dependencies for every version come from Modrinth or CurseForge, not "${source}"`);
    type = type ?? "required";
    if (!DEP_TYPES.includes(type as AutoDependency["type"])) throw new ApiError(400, `Dependency type must be one of ${DEP_TYPES.join(", ")}`);
    const found = await findDepProject(source as AutoDependency["source"], project);
    if (!found) throw new ApiError(400, `Couldn't find "${project}" on ${source === "modrinth" ? "Modrinth" : "CurseForge"}`);
    if (!out.some((o) => o.source === found.source && o.project_id === found.project_id)) {
      out.push({ ...found, type: type as AutoDependency["type"] });
    }
  }
  return out;
}

interface Release { id: string; name: string; game_versions: string[]; loaders: string[]; channel: string; date: string }
type Memo = Map<string, Promise<Release[]>>;

/** Loaders to look for: the version's own, plus Fabric for Quilt (Quilt runs Fabric mods). */
function wantedLoaders(loaders: string[]) {
  const l = loaders.map((x) => x.toLowerCase());
  return l.includes("quilt") && !l.includes("fabric") ? [...l, "fabric"] : l;
}

/** Every release of a Modrinth project (one request per project, shared by all versions). */
function modrinthReleases(dep: AutoDependency, memo: Memo) {
  const key = `mr:${dep.project_id}`;
  if (!memo.has(key)) {
    memo.set(key, modrinth(`/project/${dep.project_id}/version?include_changelog=false`).then((list) =>
      ((list ?? []) as { id: string; version_number: string; game_versions: string[]; loaders: string[]; version_type: string; date_published: string }[])
        .map((v) => ({ id: v.id, name: v.version_number, game_versions: v.game_versions, loaders: v.loaders, channel: v.version_type, date: v.date_published }))));
  }
  return memo.get(key)!;
}

/** A CurseForge mod's files for one Minecraft version (and loader). */
function curseforgeReleases(dep: AutoDependency, gameVersion: string, loader: number | null, memo: Memo) {
  const key = `cf:${dep.project_id}:${gameVersion}:${loader ?? ""}`;
  if (!memo.has(key)) {
    const q = new URLSearchParams({ gameVersion, pageSize: "50" });
    if (loader) q.set("modLoaderType", String(loader));
    memo.set(key, curseforge(`/mods/${dep.project_id}/files?${q}`).then((j) =>
      ((j?.data ?? []) as { id: number; displayName: string; fileName: string; gameVersions: string[]; releaseType: number; fileDate: string; isAvailable?: boolean; isServerPack?: boolean }[])
        .filter((f) => f.isAvailable !== false && !f.isServerPack)
        .map((f) => ({
          id: String(f.id), name: f.displayName || f.fileName,
          game_versions: f.gameVersions.filter((g) => /^\d/.test(g)),
          loaders: f.gameVersions.filter((g) => !/^\d/.test(g)).map((g) => g.toLowerCase()),
          channel: ["", "release", "beta", "alpha"][f.releaseType] ?? "release", date: f.fileDate,
        }))));
  }
  return memo.get(key)!;
}

/** The release of `dep` that fits a version best: most of its Minecraft versions, then release over beta, then newest. */
export async function bestRelease(dep: AutoDependency, gameVersions: string[], loaders: string[], memo: Memo): Promise<Release | null> {
  // A mod (Fabric, Forge…) needs a release for its own loader. Other content (shader packs, resource
  // packs, data packs, plugins) has no mod loader to match, so any loader goes (Fabric preferred).
  const modLoaders = wantedLoaders(loaders).filter((l) => l in CF_LOADERS);
  let found: Release[] = [];
  if (dep.source === "modrinth") {
    found = (await modrinthReleases(dep, memo)).filter((r) => r.game_versions.some((g) => gameVersions.includes(g))
      && (!modLoaders.length || r.loaders.some((l) => modLoaders.includes(l))));
  } else {
    const gvs = gameVersions.slice(0, 12);
    for (const loader of modLoaders.length ? [...new Set(modLoaders.map((l) => CF_LOADERS[l]))] : [null]) {
      for (const gv of gvs) found.push(...await curseforgeReleases(dep, gv, loader, memo));
    }
  }
  const score = (r: Release) => r.game_versions.filter((g) => gameVersions.includes(g)).length;
  const fabric = (r: Release) => (r.loaders.includes("fabric") ? 0 : 1);
  found.sort((a, b) => score(b) - score(a) || (CHANNEL_RANK[a.channel] ?? 3) - (CHANNEL_RANK[b.channel] ?? 3)
    || (modLoaders.length ? 0 : fabric(a) - fabric(b)) || b.date.localeCompare(a.date));
  return found[0] ?? null;
}

/** The auto dependencies for one version (without a release when none fits or the site didn't answer). */
async function autoDepsFor(auto: AutoDependency[], v: { game_versions: string[]; loaders: string[] }, memo: Memo): Promise<Dependency[]> {
  const out: Dependency[] = [];
  for (const a of auto) {
    const base: Dependency = { source: a.source, project: a.project, type: a.type, auto: true, project_id: a.project_id, url: a.url };
    const r = await bestRelease(a, v.game_versions ?? [], v.loaders ?? [], memo).catch(() => null);
    out.push(r ? { ...base, version_id: r.id, version_name: r.name } : base);
  }
  return out;
}

const same = (a: { source: string; project: string }, b: { source: string; project: string }) =>
  a.source === b.source && a.project.toLowerCase() === b.project.toLowerCase();

/**
 * Give versions of a project (all, or just `versionIds`) the project's dependencies for every version.
 * The version's own dependencies stay, except ones for the same projects (the matched ones win).
 */
export async function applyAutoDependencies(projectId: string, versionIds?: string[]) {
  const admin = createAdminClient();
  const { data: project } = await admin.from("projects").select("auto_dependencies").eq("id", projectId).maybeSingle();
  const auto = ((project?.auto_dependencies ?? []) as AutoDependency[]);
  let q = admin.from("versions").select("id, version_number, game_versions, loaders, dependencies").eq("project_id", projectId);
  if (versionIds) q = q.in("id", versionIds);
  const { data: versions } = await q;
  const memo: Memo = new Map();
  const report: { version_id: string; version_number: string; dependencies: { project: string; source: string; version: string | null }[] }[] = [];
  for (const v of versions ?? []) {
    const own = ((v.dependencies ?? []) as Dependency[]).filter((d) => !d.auto && !auto.some((a) => same(a, d)));
    const matched = await autoDepsFor(auto, v, memo);
    const next = [...own, ...matched];
    if (JSON.stringify(next) !== JSON.stringify(v.dependencies ?? [])) {
      await admin.from("versions").update({ dependencies: next }).eq("id", v.id);
    }
    report.push({
      version_id: v.id, version_number: v.version_number,
      dependencies: matched.map((d) => ({ project: d.project, source: d.source, version: d.version_name ?? null })),
    });
  }
  return report;
}

/** Same, but never fails (for version create / edit: the version itself is already saved). */
export async function applyAutoDependenciesQuietly(projectId: string, versionIds: string[]) {
  try {
    const { data } = await createAdminClient().from("projects").select("auto_dependencies").eq("id", projectId).maybeSingle();
    if (!(data?.auto_dependencies as unknown[] | undefined)?.length) {
      // nothing for every version, but old auto ones may still be on these versions
      const { data: vs } = await createAdminClient().from("versions").select("id, dependencies").in("id", versionIds);
      if (!(vs ?? []).some((v) => ((v.dependencies ?? []) as Dependency[]).some((d) => d.auto))) return;
    }
    await applyAutoDependencies(projectId, versionIds);
  } catch {
    // before migration 013, or a site didn't answer: the version keeps what it had
  }
}
