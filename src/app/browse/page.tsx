import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BEDROCK_VERSIONS, GAME_VERSIONS, GROUPS, PROJECT_TYPES, SORTS, groupInfo, typeInfo, typesInGroup } from "@/lib/constants";
import ProjectCard from "@/components/ProjectCard";
import type { Project } from "@/lib/types";

const PAGE_SIZE = 20;

type SP = Record<string, string | undefined>;

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  return { title: sp.type ? typeInfo(sp.type).plural : groupInfo(sp.group ?? "")?.label ?? "Browse everything" };
}

export default async function Browse({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const type = PROJECT_TYPES.some((t) => t.id === sp.type) ? sp.type : undefined;
  const info = type ? typeInfo(type) : null;
  const group = info?.group ?? (GROUPS.some((g) => g.id === sp.group) ? sp.group : undefined);
  const showVersions = info ? info.minecraft : group === "minecraft" || group === "bedrock";
  const bedrockList = info ? info.edition === "bedrock" : group === "bedrock";
  const q = (sp.q ?? "").trim();
  const loader = sp.loader;
  const version = sp.version;
  const category = sp.category;
  const sort = SORTS.some((s) => s.id === sp.sort) ? sp.sort! : "downloads";
  const page = Math.max(1, Number(sp.page) || 1);

  const supabase = await createClient();
  let query = supabase
    .from("projects")
    .select("*, owner:profiles!projects_owner_id_fkey(username, display_name, avatar_url)", { count: "exact" });
  if (type) query = query.eq("type", type);
  else if (group) query = query.in("type", typesInGroup(group).map((t) => t.id));
  if (q) {
    const safe = q.replace(/[%,()]/g, " ");
    query = query.or(`title.ilike.%${safe}%,summary.ilike.%${safe}%`);
  }
  if (loader) query = query.contains("loaders", [loader]);
  if (version) query = query.contains("game_versions", [version]);
  if (category) query = query.contains("categories", [category]);
  query =
    sort === "updated"
      ? query.order("updated_at", { ascending: false })
      : sort === "newest"
        ? query.order("created_at", { ascending: false })
        : sort === "likes"
          ? query.order("likes", { ascending: false }).order("downloads", { ascending: false })
          : query.order("downloads", { ascending: false });
  const { data, count, error } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const projects = (data ?? []) as Project[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const link = (patch: SP) => {
    const next = { ...sp, page: undefined, ...patch };
    const params = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => v && params.set(k, v));
    return `/browse?${params}`;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-5">
        <FilterGroup title="Section">
          <FilterLink href={link({ group: undefined, type: undefined, loader: undefined, category: undefined, version: undefined })} on={!group}>Everything</FilterLink>
          {GROUPS.map((g) => (
            <FilterLink key={g.id} href={link({ group: g.id, type: undefined, loader: undefined, category: undefined, version: g.id === "minecraft" || g.id === "bedrock" ? sp.version : undefined })} on={group === g.id}>
              {g.label}
            </FilterLink>
          ))}
        </FilterGroup>
        <FilterGroup title="Type">
          {group && (
            <FilterLink href={link({ group, type: undefined, loader: undefined, category: undefined })} on={!type}>All {groupInfo(group)?.label}</FilterLink>
          )}
          {(group ? typesInGroup(group) : PROJECT_TYPES).map((t) => (
            <FilterLink key={t.id} href={link({ group: t.group, type: t.id, loader: undefined, category: undefined })} on={type === t.id}>
              <span aria-hidden className="mr-1">{t.icon}</span>{t.plural}
            </FilterLink>
          ))}
        </FilterGroup>
        {info && (
          <FilterGroup title={info.loaderLabel}>
            {info.loaders.map((l) => (
              <FilterLink key={l} href={link({ loader: loader === l ? undefined : l })} on={loader === l}>
                <span className="capitalize">{l}</span>
              </FilterLink>
            ))}
          </FilterGroup>
        )}
        {info && (
          <FilterGroup title="Category">
            {info.categories.map((c) => (
              <FilterLink key={c} href={link({ category: category === c ? undefined : c })} on={category === c}>
                {c}
              </FilterLink>
            ))}
          </FilterGroup>
        )}
        {showVersions && (
          <FilterGroup title="Minecraft version">
            <form action="/browse" className="w-full">
              {Object.entries(sp).map(([k, v]) =>
                k !== "version" && k !== "page" && v ? <input key={k} type="hidden" name={k} value={v} /> : null
              )}
              <select name="version" defaultValue={version ?? ""} className="input">
                <option value="">Any version</option>
                {(bedrockList ? BEDROCK_VERSIONS : GAME_VERSIONS).map((v) => <option key={v}>{v}</option>)}
              </select>
              <button className="btn-ghost mt-2 w-full">Apply</button>
            </form>
          </FilterGroup>
        )}
      </aside>

      <div>
        <form action="/browse" className="mb-4 flex flex-wrap gap-2">
          {Object.entries(sp).map(([k, v]) =>
            !["q", "sort", "page"].includes(k) && v ? <input key={k} type="hidden" name={k} value={v} /> : null
          )}
          <input name="q" defaultValue={q} placeholder={`Search ${info?.plural.toLowerCase() ?? groupInfo(group ?? "")?.label.toLowerCase() ?? "everything"}…`} className="input min-w-0 flex-1" />
          <select name="sort" defaultValue={sort} className="input w-auto!">
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button className="btn-primary">Search</button>
        </form>

        {error && <p className="card mb-4 p-4 text-red-300">Couldn&apos;t load projects: {error.message}</p>}
        <p className="mb-3 text-sm text-muted">{count ?? 0} results</p>
        <div className="space-y-3">
          {projects.map((p) => <ProjectCard key={p.id} project={p} />)}
          {projects.length === 0 && <div className="card p-10 text-center text-muted">No projects match those filters.</div>}
        </div>

        {pages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            {page > 1 && <Link href={link({ page: String(page - 1) })} className="btn-ghost">← Prev</Link>}
            <span className="text-sm text-muted">Page {page} of {pages}</span>
            {page < pages && <Link href={link({ page: String(page + 1) })} className="btn-ghost">Next →</Link>}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="label">{title}</h3>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function FilterLink({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`chip hover:text-text ${on ? "chip-on" : ""}`}>
      {children}
    </Link>
  );
}
