import { automodState } from "@/lib/jace";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/requireUser";
import { isAdmin, reasonLabel } from "@/lib/moderation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatNumber, timeAgo, typeInfo } from "@/lib/constants";
import ReportActions from "@/components/ReportActions";

export const metadata = { title: "Reports" };

// with comment reports (migration 011); before that, the same without them
const SELECT_011 = "id, reason, details, status, created_at, resolved_at, resolution_note, comment_id, comment:comments(id, body, author:profiles(id, username)), reporter:profiles!reports_reporter_id_fkey(username), project:projects(id, slug, title, type, downloads, owner:profiles!projects_owner_id_fkey(username))";
const SELECT_OLD = "id, reason, details, status, created_at, resolved_at, resolution_note, reporter:profiles!reports_reporter_id_fkey(username), project:projects(id, slug, title, type, downloads, owner:profiles!projects_owner_id_fkey(username))";

interface Row {
  comment_id?: string | null;
  comment?: { id: string; body: string; author: { id: string; username: string } | null } | null;
  id: string; reason: string; details: string; status: string; created_at: string; resolved_at: string | null; resolution_note: string | null;
  reporter: { username: string } | null;
  project: { id: string; slug: string; title: string; type: string; downloads: number; owner: { username: string } | null } | null;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { user } = await requireUser("/admin/reports");
  if (!(await isAdmin(user.id))) notFound();
  const showClosed = (await searchParams).show === "closed";

  const query = async (open: boolean) => {
    for (const select of [SELECT_011, SELECT_OLD]) {
      let q = createAdminClient().from("reports").select(select);
      q = open ? q.eq("status", "open").order("created_at", { ascending: false }).limit(200)
        : q.neq("status", "open").order("resolved_at", { ascending: false }).limit(100);
      const { data, error } = await q;
      if (!error) return data;
    }
    return null;
  };
  const data = await query(true);
  const closed = showClosed ? await query(false) : null;
  const jace = await automodState();

  // Group open reports by project (or by comment) so each thing is reviewed once.
  const groups = new Map<string, Row[]>();
  for (const r of (data ?? []) as unknown as Row[]) {
    if (!r.project) continue;
    const key = r.comment_id ? `c:${r.comment_id}` : r.project.id;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/dashboard" className="text-sm text-muted hover:text-text">← Dashboard</Link>
          <h1 className="mt-2 text-3xl font-black">Reports</h1>
          <p className="text-muted">{groups.size} thing{groups.size === 1 ? "" : "s"} waiting for review</p>
          <p className="mt-1 text-xs text-muted">
            Jace auto moderation: {jace.source === "jace"
              ? (jace.rules.enabled ? `on (${jace.rules.blocked_terms.length} blocked words${jace.rules.auto_mute_after ? `, auto-mute after ${jace.rules.auto_mute_after} blocked posts` : ""})` : "connected, turned off on Jace")
              : `not connected: ${jace.note}`}
          </p>
        </div>
        <Link href={showClosed ? "/admin/reports" : "/admin/reports?show=closed"} className="btn-ghost">
          {showClosed ? "Hide closed" : "Show closed"}
        </Link>
      </div>

      {[...groups.values()].map((reports) => {
        const p = reports[0].project!;
        const c = reports[0].comment;
        return (
          <div key={c?.id ?? p.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link href={`/project/${p.slug}`} className="text-lg font-bold hover:underline" target="_blank">{p.title} ↗</Link>
                <div className="text-sm text-muted">
                  {typeInfo(p.type).label} by {p.owner?.username ?? "?"} · {formatNumber(p.downloads)} downloads ·{" "}
                  <b className="text-red-300">{reports.length} report{reports.length === 1 ? "" : "s"}</b>
                </div>
              </div>
              <ReportActions reportId={reports[0].id} projectTitle={p.title} comment={!!c} />
            </div>
            {c && (
              <div className="mt-3 rounded-lg border border-amber-300/30 bg-amber-300/5 p-3 text-sm">
                <div className="text-xs text-muted">
                  Comment by {c.author ? <Link href={`/user/${c.author.username}`} className="text-text hover:underline">@{c.author.username}</Link> : "deleted user"}
                  {" "}(moderate them on their profile)
                </div>
                <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
              </div>
            )}
            <ul className="mt-3 space-y-2">
              {reports.map((r) => (
                <li key={r.id} className="rounded-lg border border-line bg-panel-2/50 p-3 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <span className="chip border-red-400/50 text-red-300">{reasonLabel(r.reason)}</span>
                    <span className="text-muted">by {r.reporter?.username ?? "deleted user"} · {timeAgo(r.created_at)}</span>
                  </div>
                  {r.details && <p className="mt-2 whitespace-pre-wrap">{r.details}</p>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {groups.size === 0 && <div className="card p-10 text-center text-muted">No open reports. 🎉</div>}

      {showClosed && (
        <section className="space-y-2">
          <h2 className="text-xl font-bold">Closed</h2>
          <div className="card divide-y divide-line text-sm">
            {((closed ?? []) as unknown as Row[]).map((r) => (
              <div key={r.id} className="flex flex-wrap gap-2 p-3">
                <span className={`chip ${r.status === "resolved" ? "chip-on" : ""}`}>{r.status}</span>
                <span>{r.project?.title ?? "(removed)"}</span>
                <span className="text-muted">· {reasonLabel(r.reason)} · {r.resolved_at ? timeAgo(r.resolved_at) : ""}</span>
                {r.resolution_note && <span className="w-full text-muted">Note: {r.resolution_note}</span>}
              </div>
            ))}
            {!closed?.length && <p className="p-3 text-muted">Nothing closed yet.</p>}
          </div>
        </section>
      )}
    </div>
  );
}
