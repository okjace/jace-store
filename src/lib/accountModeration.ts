/**
 * Moderation of Jace Store accounts (migration 011):
 *   - banned: can browse, but can't post anything and every page shows the ban
 *   - muted:  can browse, but can't post (projects, versions, comments, likes, collections, profile)
 * They come from Jace Store's moderators, from Jace's auto moderation (auto-mute after repeated
 * blocked posts), or from the linked Jace account: Jace bans and mutes carry over with their end
 * times and are lifted here when Jace lifts them (syncFromJace, at most every 5 minutes).
 * Jace Store's moderators (public.admins) are never blocked or auto-muted.
 */
import { ApiError } from "./apiAuth";
import { nameProblem, textProblem, type Problem } from "./automod";
import { automodRules, jaceModerationStatus, type AutomodRules } from "./jace";
import { isAdmin } from "./moderation";
import { createAdminClient } from "./supabase/admin";

export interface ModState {
  id: string;
  username: string;
  banned_at: string | null; ban_until: string | null; ban_reason: string | null; ban_from: string | null;
  muted_at: string | null; mute_until: string | null; mute_reason: string | null; mute_from: string | null;
  jace_mod_checked_at: string | null;
}

const COLS = "id, username, banned_at, ban_until, ban_reason, ban_from, muted_at, mute_until, mute_reason, mute_from, jace_mod_checked_at";
const future = (t: string | null | undefined) => !t || new Date(t).getTime() > Date.now();
export const isBanned = (p: Pick<ModState, "banned_at" | "ban_until">) => !!p.banned_at && future(p.ban_until);
export const isMuted = (p: Pick<ModState, "muted_at" | "mute_until">) => !!p.muted_at && future(p.mute_until);

export function until(t: string | null | undefined) {
  if (!t) return "for good";
  return `until ${new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" })} UTC`;
}

/** The account's moderation state (null if the columns don't exist yet, i.e. before migration 011). */
export async function loadState(userId: string): Promise<ModState | null> {
  const { data, error } = await createAdminClient().from("profiles").select(COLS).eq("id", userId).maybeSingle();
  if (error || !data) return null;
  return data as ModState;
}

async function patch(userId: string, values: Partial<ModState>) {
  await createAdminClient().from("profiles").update(values).eq("id", userId);
}

export async function banAccount(userId: string, minutes: number | null, reason: string | null, from: "store" | "jace") {
  const end = minutes ? new Date(Date.now() + minutes * 60_000).toISOString() : null;
  await patch(userId, { banned_at: new Date().toISOString(), ban_until: end, ban_reason: reason?.slice(0, 400) || null, ban_from: from });
}
export async function unbanAccount(userId: string) {
  await patch(userId, { banned_at: null, ban_until: null, ban_reason: null, ban_from: null });
}
export async function muteAccount(userId: string, minutes: number | null, reason: string | null, from: "store" | "jace" | "automod") {
  const end = minutes ? new Date(Date.now() + minutes * 60_000).toISOString() : null;
  await patch(userId, { muted_at: new Date().toISOString(), mute_until: end, mute_reason: reason?.slice(0, 400) || null, mute_from: from });
}
export async function unmuteAccount(userId: string) {
  await patch(userId, { muted_at: null, mute_until: null, mute_reason: null, mute_from: null });
}

/**
 * Bring a linked Jace account's ban and mute over (at most every 5 minutes unless `now`).
 * Only touches restrictions that came from Jace, never Jace Store's own.
 */
export async function syncFromJace(state: ModState, now = false): Promise<ModState> {
  if (!now && state.jace_mod_checked_at && Date.now() - new Date(state.jace_mod_checked_at).getTime() < 5 * 60_000) return state;
  const admin = createAdminClient();
  const { data: link } = await admin.from("jace_links").select("jace_id").eq("user_id", state.id).maybeSingle();
  await patch(state.id, { jace_mod_checked_at: new Date().toISOString() });
  if (!link) return state;
  const j = await jaceModerationStatus(link.jace_id);
  if (!j) return state;                                  // Jace unreachable or not official: leave as is
  const left = (t: string | null) => (t ? Math.max(1, (new Date(t).getTime() - Date.now()) / 60_000) : null);
  let s = { ...state };
  if (j.banned && (!isBanned(s) || s.ban_from === "jace")) {
    if (!isBanned(s) || (s.ban_until ?? null) !== (j.ban_until ?? null)) {
      const reason = `Banned on Jace${j.ban_reason ? `: ${j.ban_reason}` : ""}`;
      await banAccount(s.id, left(j.ban_until), reason, "jace");
      s = { ...s, banned_at: new Date().toISOString(), ban_until: j.ban_until, ban_reason: reason, ban_from: "jace" };
    }
  } else if (!j.banned && s.banned_at && s.ban_from === "jace") {
    await unbanAccount(s.id);
    s = { ...s, banned_at: null, ban_until: null, ban_reason: null, ban_from: null };
  }
  if (j.muted && (!isMuted(s) || s.mute_from === "jace")) {
    if (!isMuted(s) || (s.mute_until ?? null) !== (j.mute_until ?? null)) {
      const reason = `Muted on Jace${j.mute_reason ? `: ${j.mute_reason}` : ""}`;
      await muteAccount(s.id, left(j.mute_until), reason, "jace");
      s = { ...s, muted_at: new Date().toISOString(), mute_until: j.mute_until, mute_reason: reason, mute_from: "jace" };
    }
  } else if (!j.muted && s.muted_at && s.mute_from === "jace") {
    await unmuteAccount(s.id);
    s = { ...s, muted_at: null, mute_until: null, mute_reason: null, mute_from: null };
  }
  return s;
}

/** The account as it is now (Jace synced). Null before migration 011. */
export async function currentState(userId: string, now = false): Promise<ModState | null> {
  const s = await loadState(userId);
  return s ? syncFromJace(s, now) : null;
}

export function restriction(s: ModState | null): { kind: "banned" | "muted"; message: string } | null {
  if (!s) return null;
  if (isBanned(s)) return { kind: "banned", message: `Your account is banned ${until(s.ban_until)}${s.ban_reason ? ` (${s.ban_reason})` : ""}.` };
  if (isMuted(s)) return { kind: "muted", message: `You're muted ${until(s.mute_until)}${s.mute_reason ? ` (${s.mute_reason})` : ""}. You can browse, but not post.` };
  return null;
}

/** Throws if the account is banned or muted. */
export async function requireCanPost(userId: string) {
  const r = restriction(await currentState(userId));
  if (r) throw new ApiError(403, r.message);
}

export interface Content {
  /** Text people write: descriptions, changelogs, bios (blocked words). */
  texts?: (string | null | undefined)[];
  /** Comments: blocked words and Jace's link limit. */
  messages?: (string | null | undefined)[];
  /** Names: titles, usernames, display names (blocked words and blocked usernames). */
  names?: (string | null | undefined)[];
  /** New pictures: "post" (project icons, screenshots) or "profile" (profile picture). */
  image?: "post" | "profile" | null;
}

/**
 * Everything that posts calls this first: not banned or muted, and allowed by Jace's auto
 * moderation. A refused post is logged; enough of them in 24 hours mutes the account.
 */
export async function guardPost(userId: string, area: string, content: Content = {}) {
  await requireCanPost(userId);
  const rules = await automodRules();
  if (!rules.enabled) return;
  const problem = findProblem(rules, content);
  if (!problem || (await isAdmin(userId))) return;
  await block(userId, area, problem.excerpt, problem, rules);
}

function findProblem(rules: AutomodRules, c: Content): (Problem & { excerpt: string }) | null {
  for (const n of c.names ?? []) {
    const p = n && nameProblem(rules, n);
    if (p) return { ...p, excerpt: n! };
  }
  for (const m of c.messages ?? []) {
    const p = m && textProblem(rules, m);
    if (p) return { ...p, excerpt: m! };
  }
  for (const t of c.texts ?? []) {
    const p = t && textProblem(rules, t, 0);            // descriptions may link freely
    if (p) return { ...p, excerpt: t! };
  }
  if (c.image === "post" && rules.block_post_images) {
    return { matched: "picture", message: "New project pictures aren't allowed on Jace Store right now.", excerpt: "(a picture)" };
  }
  if (c.image === "profile" && rules.block_profile_images) {
    return { matched: "picture", message: "New profile pictures aren't allowed on Jace Store right now.", excerpt: "(a picture)" };
  }
  return null;
}

async function block(userId: string, area: string, excerpt: string, problem: Problem, rules: AutomodRules): Promise<never> {
  const admin = createAdminClient();
  await admin.from("automod_log").insert({ user_id: userId, area, matched: problem.matched, excerpt: excerpt.slice(0, 300) })
    .then(() => {}, () => {});
  if (rules.auto_mute_after > 0) {
    const since = new Date(Date.now() - 86400_000).toISOString();
    const { count } = await admin.from("automod_log").select("id", { count: "exact", head: true }).eq("user_id", userId).gt("created_at", since);
    if ((count ?? 0) >= rules.auto_mute_after) {
      await muteAccount(userId, rules.auto_mute_minutes || null, `Automatic: ${count} blocked posts in 24 hours`, "automod");
      throw new ApiError(403, `${problem.message} You've been muted for a while for repeatedly posting things that aren't allowed.`);
    }
  }
  throw new ApiError(400, problem.message);
}

/** Moderator durations (minutes; null = for good). */
export const DURATIONS: Record<string, number | null> = {
  "1h": 60, "1d": 1440, "3d": 4320, "1w": 10080, "30d": 43200, forever: null,
};
