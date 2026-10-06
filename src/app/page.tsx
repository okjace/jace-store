import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PROJECT_TYPES } from "@/lib/constants";
import ProjectCard from "@/components/ProjectCard";
import type { Project } from "@/lib/types";

export const revalidate = 60;

export default async function Home() {
  const supabase = await createClient();
  const select = "*, owner:profiles(username, display_name, avatar_url)";
  const [{ data: popular }, { data: fresh }] = await Promise.all([
    supabase.from("projects").select(select).order("downloads", { ascending: false }).limit(6),
    supabase.from("projects").select(select).order("updated_at", { ascending: false }).limit(6),
  ]);

  return (
    <div className="space-y-12">
      <section className="card relative overflow-hidden p-8 sm:p-12">
        <div className="absolute inset-0 -z-0 bg-[radial-gradient(circle_at_80%_20%,rgba(74,222,128,.18),transparent_55%)]" />
        <div className="relative max-w-2xl">
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            Mods, packs, shaders & apps for Minecraft.
          </h1>
          <p className="mt-4 text-lg text-muted">
            Upload your creations and download everyone else&apos;s. Works with Prism, MultiMC,
            ATLauncher, the Modrinth App and the official launcher.
          </p>
          <form action="/browse" className="mt-6 flex gap-2">
            <input name="q" placeholder="Search everything…" className="input text-base!" />
            <button className="btn-primary">Search</button>
          </form>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {PROJECT_TYPES.map((t) => (
          <Link key={t.id} href={`/browse?type=${t.id}`} className="card p-4 transition hover:border-brand">
            <div className="font-bold">{t.plural}</div>
            <div className="text-xs text-muted">
              {t.installDir ? `→ ${t.installDir}/` : t.id === "modpack" ? "Import into launcher" : "Desktop & mobile"}
            </div>
          </Link>
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
