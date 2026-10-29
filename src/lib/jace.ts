/**
 * Jace Store as an official Jace app: Jace's auto moderation rules and a linked Jace account's
 * ban / mute status, with the app's client credentials (JACE_CLIENT_ID / JACE_CLIENT_SECRET).
 * Jace only answers official apps (registered by Jace's owner); otherwise everything here is
 * simply "off" and status() explains why.
 */
export const JACE_URL = "https://jaceo.vercel.app";

function basic(): string | null {
  const id = process.env.JACE_CLIENT_ID, secret = process.env.JACE_CLIENT_SECRET;
  return id && secret ? `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` : null;
}

export interface JaceModeration {
  user_id: string;
  username: string;
  banned: boolean;
  ban_reason: string | null;
  ban_until: string | null;
  muted: boolean;
  mute_reason: string | null;
  mute_until: string | null;
}

/** A Jace account's ban / mute status, or null if Jace can't tell us. */
export async function jaceModerationStatus(jaceUserId: string): Promise<JaceModeration | null> {
  const auth = basic();
  if (!auth) return null;
  try {
    const r = await fetch(`${JACE_URL}/api/oauth/moderation`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(6000),
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({ action: "status", user_id: jaceUserId }),
    });
    return r.ok ? ((await r.json()) as JaceModeration) : null;
  } catch {
    return null;
  }
}

export type AutomodRules = {
  enabled: boolean; blocked_terms: string[]; blocked_usernames: string[];
  block_post_images: boolean; block_profile_images: boolean;
  max_links: number; auto_mute_after: number; auto_mute_minutes: number;
};

export const AUTOMOD_OFF: AutomodRules = {
  enabled: false, blocked_terms: [], blocked_usernames: [], block_post_images: false, block_profile_images: false,
  max_links: 0, auto_mute_after: 0, auto_mute_minutes: 1440,
};

let cache: { at: number; rules: AutomodRules; source: "jace" | "off"; note: string } | null = null;

/** Jace's rules, asked at most once a minute; if Jace can't be reached, the last ones we had. */
export async function automodRules(): Promise<AutomodRules> {
  return (await automodState()).rules;
}

/** The rules plus where they came from (for the moderators' page). */
export async function automodState() {
  if (cache && Date.now() - cache.at < 60_000) return cache;
  const auth = basic();
  if (!auth) return (cache = { at: Date.now(), rules: AUTOMOD_OFF, source: "off" as const, note: "Jace sign-in isn't set up (JACE_CLIENT_ID / JACE_CLIENT_SECRET)." });
  try {
    const r = await fetch(`${JACE_URL}/api/oauth/automod`, { cache: "no-store", signal: AbortSignal.timeout(4000), headers: { Authorization: auth } });
    if (r.status === 401 || r.status === 403) {
      return (cache = { at: Date.now(), rules: AUTOMOD_OFF, source: "off" as const,
        note: "Jace didn't accept Jace Store as an official app. Register it from Jace's owner account." });
    }
    if (!r.ok) throw new Error(String(r.status));
    const d = (await r.json()) as Partial<AutomodRules>;
    const rules: AutomodRules = {
      enabled: d.enabled !== false,
      blocked_terms: Array.isArray(d.blocked_terms) ? d.blocked_terms.map(String) : [],
      blocked_usernames: Array.isArray(d.blocked_usernames) ? d.blocked_usernames.map(String) : [],
      block_post_images: d.block_post_images === true,
      block_profile_images: d.block_profile_images === true,
      max_links: Number(d.max_links) || 0,
      auto_mute_after: Number(d.auto_mute_after) || 0,
      auto_mute_minutes: Number(d.auto_mute_minutes) || 0,
    };
    return (cache = { at: Date.now(), rules, source: "jace" as const, note: "" });
  } catch {
    if (cache && cache.source === "jace") return (cache = { ...cache, at: Date.now() - 30_000 });   // retry in 30 s
    return (cache = { at: Date.now() - 30_000, rules: AUTOMOD_OFF, source: "off" as const, note: "Couldn't reach Jace." });
  }
}
