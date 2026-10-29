import { ApiError, handler, readJson } from "@/lib/apiAuth";
import { deleteProjectCompletely, isAdmin } from "@/lib/moderation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST { action: "dismiss" | "resolve" | "remove_project" | "remove_comment", note? } — moderators only.
 * remove_project deletes the project (and with it every report about it); remove_comment deletes the
 * reported comment (and its replies and reports). dismiss/resolve close every open report about the
 * same project (or the same comment).
 */
export const POST = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  if (req.headers.get("authorization")) throw new ApiError(403, "Moderate from the website");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await isAdmin(user?.id))) throw new ApiError(403, "Moderators only");

  const { id } = await params;
  const { action, note } = await readJson<{ action?: string; note?: string }>(req);
  const admin = createAdminClient();
  const { data: report } = await admin.from("reports").select("*").eq("id", id).maybeSingle();
  if (!report) throw new ApiError(404, "Report not found");

  if (action === "remove_project") {
    const files = await deleteProjectCompletely(report.project_id);
    return { removed: true, files_removed: files };
  }
  if (action === "remove_comment") {
    if (!report.comment_id) throw new ApiError(400, "This report isn't about a comment");
    await admin.from("comments").delete().eq("id", report.comment_id);
    return { removed: true };
  }
  if (action !== "dismiss" && action !== "resolve") throw new ApiError(400, "Unknown action");
  // Close every open report about this project (or this comment) at once.
  let q = admin.from("reports")
    .update({
      status: action === "dismiss" ? "dismissed" : "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by: user!.id,
      resolution_note: note?.trim().slice(0, 500) || null,
    })
    .eq("project_id", report.project_id)
    .eq("status", "open");
  if ("comment_id" in report) q = report.comment_id ? q.eq("comment_id", report.comment_id) : q.is("comment_id", null);
  const { error } = await q;
  if (error) throw new ApiError(400, error.message);
  return { ok: true };
});
