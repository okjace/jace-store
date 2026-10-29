import Link from "next/link";
import { requireUser } from "@/lib/requireUser";
import { formatNumber, timeAgo, typeInfo } from "@/lib/constants";
import type { Project } from "@/lib/types";
import ProjectIcon from "@/components/ProjectIcon";
import { isAdmin } from "@/lib/moderation";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const { supabase, user } = await requireUser("/dashboard");
  const [{ data: profile }, { data: projects }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("projects").select("*").eq("owner_id", user.id).order("updated_at", { ascending: false }),
  ]);
  const list = (projects ?? []) as Project[];
  const moderator = await isAdmin(user.id);
  const openReports = moderator
    ? (await createAdminClient().from("reports").select("id", { count: "exact", head: true }).eq("status", "open")).count ?? 0
    : 0;
  const total = list.reduce((a, p) => a + p.downloads, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-black">Your projects</h1>
          <Link href="/new" className="btn-primary">+ New project</Link>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Projects" value={list.length} />
          <Stat label="Total downloads" value={total} />
        </div>
        <div className="card divide-y divide-line">
          {list.map((p) => (
            <div key={p.id} className="flex items-center gap-4 p-4">
              <ProjectIcon url={p.icon_url} title={p.title} type={p.type} size={48} />
              <div className="min-w-0 flex-1">
                <Link href={`/project/${p.slug}`} className="font-bold hover:underline">{p.title}</Link>
                <div className="text-sm text-muted">
                  {typeInfo(p.type).label} · {formatNumber(p.downloads)} downloads · updated {timeAgo(p.updated_at)}
                </div>
              </div>
              <Link href={`/project/${p.slug}/edit`} className="btn-ghost">Manage</Link>
            </div>
          ))}
          {list.length === 0 && <p className="p-8 text-center text-muted">You haven&apos;t uploaded anything yet.</p>}
        </div>
      </div>
      <aside className="space-y-4">
        {profile && (
          <div className="card flex items-center gap-3 p-4">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="h-12 w-12 rounded-full border border-line object-cover" />
            ) : (
              <div className="grid h-12 w-12 place-items-center rounded-full bg-panel-2 text-xl font-black">{profile.username[0].toUpperCase()}</div>
            )}
            <div className="min-w-0">
              <div className="truncate font-bold">{profile.display_name || profile.username}</div>
              <div className="truncate text-sm text-muted">@{profile.username}</div>
            </div>
          </div>
        )}
        <Link href="/settings" className="btn-primary w-full">Account settings</Link>
        <Link href="/collections" className="btn-ghost w-full">Your collections</Link>
        {moderator && (
          <Link href="/admin/reports" className="btn-ghost w-full">
            Reports {openReports > 0 && <span className="rounded bg-red-500/20 px-1.5 text-xs text-red-300">{openReports}</span>}
          </Link>
        )}
        {profile && <Link href={`/user/${profile.username}`} className="btn-ghost w-full">View public profile</Link>}
        <Link href="/dashboard/tokens" className="btn-ghost w-full">CLI & API tokens</Link>
        <form action="/auth/signout" method="post">
          <button className="btn-ghost w-full">Sign out</button>
        </form>
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div className="text-2xl font-black">{formatNumber(value)}</div>
    </div>
  );
}
