import { siteUrl } from "./constants";

// "Sign in with Jace" — a plain OAuth 2.0 authorization-code provider (no OIDC),
// so it's handled here rather than by Supabase Auth.
export const JACE = {
  authorize: "https://jaceo.vercel.app/oauth/authorize",
  token: "https://jaceo.vercel.app/api/oauth/token",
  userinfo: "https://jaceo.vercel.app/api/oauth/userinfo",
};

export const STATE_COOKIE = "jace_oauth_state";

export function jaceRedirectUri() {
  return `${siteUrl()}/api/auth/jace/callback`;
}

export interface JaceUser {
  id: string;
  username: string | null;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

/** Userinfo is plain JSON; accept the common field-name variants. */
export function normalizeUserinfo(raw: Record<string, unknown>): JaceUser | null {
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = raw[k];
      if (typeof v === "string" && v) return v;
      if (typeof v === "number") return String(v);
    }
    return null;
  };
  const id = pick("sub", "id", "user_id", "uid");
  if (!id) return null;
  return {
    id,
    username: pick("username", "preferred_username", "user_name", "login", "handle"),
    name: pick("name", "display_name", "full_name"),
    email: pick("email"),
    avatarUrl: pick("avatar_url", "picture", "avatar", "image"),
  };
}
