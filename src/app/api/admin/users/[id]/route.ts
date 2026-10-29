import { ApiError, handler, readJson } from "@/lib/apiAuth";
import { banAccount, currentState, DURATIONS, muteAccount, unbanAccount, unmuteAccount } from "@/lib/accountModeration";
import { isAdmin } from "@/lib/moderation";
import { createClient } from "@/lib/supabase/server";

/**
 * POST { action: "ban" | "unban" | "mute" | "unmute" | "sync", duration?: "1h"|"1d"|"3d"|"1w"|"30d"|"forever", reason? }
 * Jace Store moderators only. Bans and mutes here are Jace Store's own (not the Jace account's).
 */
export const POST = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  if (req.headers.get("authorization")) throw new ApiError(403, "Moderate from the website");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await isAdmin(user?.id))) throw new ApiError(403, "Moderators only");
  const { id } = await params;
  if (id === user!.id) throw new ApiError(400, "You can't moderate yourself");
  if (await isAdmin(id)) throw new ApiError(400, "Moderators can't be banned or muted");
  const b = await readJson<{ action?: string; duration?: string; reason?: string }>(req);
  const minutes = b.duration && b.duration in DURATIONS ? DURATIONS[b.duration] : null;
  const reason = String(b.reason ?? "").trim() || null;
  switch (b.action) {
    case "ban": await banAccount(id, minutes, reason, "store"); break;
    case "unban": await unbanAccount(id); break;
    case "mute": await muteAccount(id, minutes, reason, "store"); break;
    case "unmute": await unmuteAccount(id); break;
    case "sync": break;
    default: throw new ApiError(400, "Unknown action");
  }
  return await currentState(id, b.action === "sync");
});
