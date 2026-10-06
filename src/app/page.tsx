import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GROUPS, TAGLINE, typesInGroup } from "@/lib/constants";
import ProjectCard from "@/components/ProjectCard";
import type { Project } from "@/lib/types";

export const revalidate = 60;

export default async function Home() {
  const supabase = await createClient();
  const select = "*, owner:profiles(username, display_name, avatar_url)";
  const [{ data: popular }, { data: fresh }, { count }] = await Promise.all([
    supabase.from("projects").select(select).order("downloads", { ascending: false }).limit(6),
    supabase.from("projects").select(select).order("updated_at", { ascending: false }).limit(6),
    supabase.from("projects").select("id", { count: "exact", head: true }),
  ]);

  return (
    <div className="space-y-14">
      <section className="card relative overflow-hidden p-8 sm:p-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(74,222,128,.20),transparent_50%),radial-gradient(circle_at_10%_100%,rgba(96,165,250,.12),transparent_45%)]" />
        <div className="relative max-w-3xl">
          <span className="chip chip-on mb-4">{TAGLINE}</span>
          <h1 className="text-4xl font-black tracking-tight sm:text-6xl">
            Share anything.<br />Download everything.
          </h1>
          <p className="mt-5 text-lg text-muted">
            Games, apps, browser extensions, Minecraft mods, 3D assets, wallpapers, music, fonts and more, all in one place.
            Upload once and anyone can find it, download it and use it. Free for creators.
          </p>
          <form action="/browse" className="mt-7 flex gap-2">
            <input name="q" placeholder="Search games, mods, apps, assets…" className="input text-base!" />
            <button className="btn-primary">Search</button>
          </form>
          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            <Link href="/new" className="btn-ghost">Upload your stuff →</Link>
            <span className="self-center text-muted">{count ?? 0} {count === 1 ? "project" : "projects"} and counting</span>
          </div>
        </div>
      </section>

      {GROUPS.map((g) => (
        <section key={g.id}>
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">{g.label}</h2>
              <p className="text-sm text-muted">{g.blurb}</p>
            </div>
            <Link href={`/browse?group=${g.id}`} className="shrink-0 text-sm text-brand hover:underline">Browse {g.label.toLowerCase()} →</Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {typesInGroup(g.id).map((t) => (
              <Link key={t.id} href={`/browse?type=${t.id}`} className="card flex items-center gap-3 p-4 transition hover:border-brand">
                <span className="text-2xl" aria-hidden>{t.icon}</span>
                <span className="font-semibold">{t.plural}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <section className="card grid gap-6 p-8 sm:grid-cols-3">
        {[
          ["Upload anything", "Up to 500 MB per file, straight to fast cloud storage. Every file gets SHA-1 and SHA-512 checksums."],
          ["Versions & changelogs", "Ship updates with release, beta and alpha channels. People always get the latest."],
          ["Minecraft launcher ready", "Install guides for Prism, Modrinth App, ATLauncher and CurseForge, plus a modpack builder."],
        ].map(([h, b]) => (
          <div key={h}>
            <h3 className="font-bold">{h}</h3>
            <p className="mt-1 text-sm text-muted">{b}</p>
          </div>
        ))}
      </section>

      <Section title="Most downloaded" href="/browse?sort=downloads" projects={popular as Project[] | null} />
      <Section title="Recently updated" href="/browse?sort=updated" projects={fresh as Project[] | null} />
    </div>
  );
}

function Section({ title, href, projects }: { title: string; href: string; projects: Project[] | null }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xl font-bold">{title}</h2>
        <Link href={href} className="text-sm text-brand hover:underline">View all →</Link>
      </div>
      {projects && projects.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {projects.map((p) => <ProjectCard key={p.id} project={p} />)}
        </div>
      ) : (
        <div className="card p-8 text-center text-muted">
          Nothing here yet. <Link href="/new" className="text-brand underline">Be the first to upload.</Link>
        </div>
      )}
    </section>
  );
}
