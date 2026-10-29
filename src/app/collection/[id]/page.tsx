import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/constants";
import type { Project } from "@/lib/types";
import ProjectCard from "@/components/ProjectCard";
import CollectionEditor from "@/components/CollectionEditor";

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data: c } = await supabase.from("collections")
    .select("*, owner:profiles(username, display_name), collection_items(added_at, project:projects(*, owner:profiles(username, display_name, avatar_url)))")
    .eq("id", id).maybeSingle();                  // private ones are only visible to their owner (RLS)
  if (!c) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return { c, mine: user?.id === c.owner_id };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const d = await load((await params).id);
  return d ? { title: d.c.title, description: d.c.description || `A collection by ${d.c.owner?.username}` } : {};
}

export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const d = await load((await params).id);
  if (!d) notFound();
  const { c, mine } = d;
  const items = ((c.collection_items ?? []) as { added_at: string; project: Project | null }[])
    .filter((i) => i.project).sort((a, b) => b.added_at.localeCompare(a.added_at));
  return (
    <div className="space-y-6">
      <header className="card p-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="label">Collection {!c.is_public && "· 🔒 private"}</div>
            <h1 className="text-3xl font-black">{c.title}</h1>
            <p className="mt-1 text-sm text-muted">
              by <Link href={`/user/${c.owner?.username}`} className="text-text hover:underline">{c.owner?.display_name || c.owner?.username}</Link>
              {" "}· {items.length} project{items.length === 1 ? "" : "s"} · updated {timeAgo(c.updated_at)}
            </p>
            {c.description && <p className="mt-3 whitespace-pre-wrap">{c.description}</p>}
          </div>
        </div>
        {mine && <CollectionEditor collection={{ id: c.id, title: c.title, description: c.description, is_public: c.is_public }} projects={items.map((i) => ({ id: i.project!.id, title: i.project!.title }))} />}
      </header>
      <div className="grid gap-3 lg:grid-cols-2">
        {items.map((i) => <ProjectCard key={i.project!.id} project={i.project!} />)}
      </div>
      {items.length === 0 && <div className="card p-10 text-center text-muted">Empty for now. Use ☆ Save on a project to add it.</div>}
    </div>
  );
}
