import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/requireUser";
import { isAdmin, reasonLabel } from "@/lib/moderation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatNumber, timeAgo, typeInfo } from "@/lib/constants";
import ReportActions from "@/components/ReportActions";

export const metadata = { title: "Reports" };

interface Row {
  id: string; reason: string; details: string; status: string; created_at: string; resolved_at: string | null; resolution_note: string | null;
  reporter: { username: string } | null;
  project: { id: string; slug: string; title: string; type: string; downloads: number; owner: { username: string } | null } | null;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { user } = await requireUser("/admin/reports");
  if (!(await isAdmin(user.id))) notFound();
  const showClosed = (await searchParams).show === "closed";

  const { data } = await createAdminClient()
    .from("reports")
    .select("id, reason, details, status, created_at, resolved_at, resolution_note, reporter:profiles!reports_reporter_id_fkey(username), project:projects(id, slug, title, type, downloads, owner:profiles(username))")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(200);
  const { data: closed } = showClosed
    ? await createAdminClient()
        .from("reports")
        .select("id, reason, details, status, created_at, resolved_at, resolution_note, reporter:profiles!reports_reporter_id_fkey(username), project:projects(id, slug, title, type, downloads, owner:profiles(username))")
        .neq("status", "open")
        .order("resolved_at", { ascending: false })
        .limit(100)
    : { data: null };

  // Group open reports by project so each project is reviewed once.
  const groups = new Map<string, Row[]>();
  for (const r of (data ?? []) as unknown as Row[]) {
    if (!r.project) continue;
    groups.set(r.project.id, [...(groups.get(r.project.id) ?? []), r]);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/dashboard" className="text-sm text-muted hover:text-text">← Dashboard</Link>
          <h1 className="mt-2 text-3xl font-black">Reports</h1>
          <p className="text-muted">{groups.size} project{groups.size === 1 ? "" : "s"} waiting for review</p>
        </div>
        <Link href={showClosed ? "/admin/reports" : "/admin/reports?show=closed"} className="btn-ghost">
          {showClosed ? "Hide closed" : "Show closed"}
        </Link>
      </div>

      {[...groups.values()].map((reports) => {
        const p = reports[0].project!;
        return (
          <div key={p.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link href={`/project/${p.slug}`} className="text-lg font-bold hover:underline" target="_blank">{p.title} ↗</Link>
                <div className="text-sm text-muted">
                  {typeInfo(p.type).label} by {p.owner?.username ?? "?"} · {formatNumber(p.downloads)} downloads ·{" "}
                  <b className="text-red-300">{reports.length} report{reports.length === 1 ? "" : "s"}</b>
                </div>
              </div>
              <ReportActions reportId={reports[0].id} projectTitle={p.title} />
            </div>
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
