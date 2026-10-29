import Link from "next/link";
import { isAdmin } from "@/lib/moderation";
import { currentState } from "@/lib/accountModeration";
import ModerationPanel from "@/components/ModerationPanel";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/constants";
import type { Project } from "@/lib/types";
import ProjectCard from "@/components/ProjectCard";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  return { title: (await params).username };
}

export default async function UserPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
  if (!profile) notFound();
  const { data } = await supabase
    .from("projects")
    .select("*, owner:profiles!projects_owner_id_fkey(username, display_name, avatar_url)")
    .eq("owner_id", profile.id)
    .order("downloads", { ascending: false });
  const projects = (data ?? []) as Project[];
  const { data: { user: viewer } } = await supabase.auth.getUser();
  const { data: cols } = await supabase.from("collections").select("id, title, description, is_public, collection_items(project_id)")
    .eq("owner_id", profile.id).order("updated_at", { ascending: false });
  const collections = ((cols ?? []) as { id: string; title: string; description: string; is_public: boolean; collection_items: unknown[] }[])
    .filter((c) => c.is_public || viewer?.id === profile.id);
  const moderator = viewer ? await isAdmin(viewer.id) : false;
  const modState = moderator && viewer!.id !== profile.id ? await currentState(profile.id) : null;

  return (
    <div className="space-y-6">
      <div className="card flex items-center gap-5 p-6">
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar_url} alt="" className="h-20 w-20 rounded-full border border-line" />
        ) : (
          <div className="grid h-20 w-20 place-items-center rounded-full bg-panel-2 text-3xl font-black">{profile.username[0].toUpperCase()}</div>
        )}
        <div>
          <h1 className="text-3xl font-black">{profile.display_name || profile.username}</h1>
          <p className="text-muted">@{profile.username} · {projects.length} projects · {formatNumber(projects.reduce((a, p) => a + p.downloads, 0))} downloads</p>
          {profile.bio && <p className="mt-2">{profile.bio}</p>}
        </div>
      </div>
      {modState && <ModerationPanel userId={profile.id} username={profile.username} state={modState} />}
      <div className="grid gap-3 lg:grid-cols-2">
        {projects.map((p) => <ProjectCard key={p.id} project={p} />)}
      </div>
      {collections.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-bold">Collections</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {collections.map((c) => (
              <Link key={c.id} href={`/collection/${c.id}`} className="card p-4 hover:border-muted">
                <div className="font-bold">{c.title} {!c.is_public && "🔒"}</div>
                <div className="text-sm text-muted">{c.collection_items.length} projects</div>
                {c.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{c.description}</p>}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
