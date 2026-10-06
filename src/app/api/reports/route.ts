import { ApiError, handler, readJson } from "@/lib/apiAuth";
import { REPORT_REASONS } from "@/lib/moderation-reasons";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** POST { project_id, reason, details? } — report a project (signed-in users). */
export const POST = handler(async (req) => {
  if (req.headers.get("authorization")) throw new ApiError(403, "Report from the website");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new ApiError(401, "Sign in to report a project");

  const b = await readJson<{ project_id?: string; reason?: string; details?: string }>(req);
  if (!REPORT_REASONS.some((r) => r.id === b.reason)) throw new ApiError(400, "Pick a reason");
  const details = String(b.details ?? "").trim().slice(0, 2000);
  if (b.reason === "other" && details.length < 10) throw new ApiError(400, "Please describe the problem");

  const admin = createAdminClient();
  const { data: project } = await admin.from("projects").select("id, owner_id").eq("id", String(b.project_id ?? "")).maybeSingle();
  if (!project) throw new ApiError(404, "Project not found");
  if (project.owner_id === user.id) throw new ApiError(400, "You can't report your own project");

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin.from("reports").select("id", { count: "exact", head: true })
    .eq("reporter_id", user.id).gte("created_at", since);
  if ((count ?? 0) >= 10) throw new ApiError(429, "You've sent a lot of reports today. Try again tomorrow.");

  const { error } = await admin.from("reports").insert({ project_id: project.id, reporter_id: user.id, reason: b.reason, details });
  if (error) {
    if (error.code === "23505") throw new ApiError(400, "You already reported this project. A moderator will review it.");
    throw new ApiError(400, error.message);
  }
  return { ok: true };
});
