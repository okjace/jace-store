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
    .select("*, owner:profiles(username, display_name, avatar_url)")
    .eq("owner_id", profile.id)
    .order("downloads", { ascending: false });
  const projects = (data ?? []) as Project[];

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
      <div className="grid gap-3 lg:grid-cols-2">
        {projects.map((p) => <ProjectCard key={p.id} project={p} />)}
      </div>
    </div>
  );
}
