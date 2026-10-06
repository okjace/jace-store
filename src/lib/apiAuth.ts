import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const TOKEN_PREFIX = "jst_";

export function newToken() {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token), prefix: token.slice(0, 10) };
}

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Who is calling? Accepts `Authorization: Bearer jst_…` (CLI / AI agents) or the
 * normal Supabase session cookie (the website). Returns the user id; all writes
 * then go through the service-role client with explicit ownership checks.
 */
export async function requireApiUser(req: Request): Promise<string> {
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (bearer) {
    if (!bearer.startsWith(TOKEN_PREFIX)) throw new ApiError(401, "Invalid token");
    const admin = createAdminClient();
    const { data } = await admin
      .from("api_tokens")
      .select("id, user_id")
      .eq("token_hash", hashToken(bearer))
      .maybeSingle();
    if (!data) throw new ApiError(401, "Invalid or revoked token");
    await admin.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
    return data.user_id;
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new ApiError(401, "Not signed in. Pass Authorization: Bearer <token>.");
  return user.id;
}

/** Load a project by slug or id and make sure `userId` owns it. */
export async function ownedProject(userId: string, slugOrId: string) {
  const admin = createAdminClient();
  const isId = /^[0-9a-f-]{36}$/i.test(slugOrId);
  const { data } = await admin.from("projects").select("*").eq(isId ? "id" : "slug", slugOrId).maybeSingle();
  if (!data) throw new ApiError(404, `Project "${slugOrId}" not found`);
  if (data.owner_id !== userId) throw new ApiError(403, "You don't own this project");
  return data;
}

/** Load a version and make sure `userId` owns its project. */
export async function ownedVersion(userId: string, versionId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(versionId)) throw new ApiError(404, "Version not found");
  const admin = createAdminClient();
  const { data } = await admin
    .from("versions")
    .select("*, project:projects!versions_project_id_fkey(id, slug, type, owner_id)")
    .eq("id", versionId)
    .maybeSingle();
  if (!data) throw new ApiError(404, "Version not found");
  if (data.project.owner_id !== userId) throw new ApiError(403, "You don't own this version");
  return data as typeof data & { project: { id: string; slug: string; type: string; owner_id: string } };
}

/** Wrap a route handler: JSON errors, no caching. */
export function handler<A extends unknown[]>(fn: (req: Request, ...args: A) => Promise<unknown>) {
  return async (req: Request, ...args: A) => {
    try {
      const out = await fn(req, ...args);
      return NextResponse.json(out ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 500;
      const message = e instanceof Error ? e.message : String(e);
      if (status === 500) console.error(e);
      return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
    }
  };
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, "Body must be JSON");
  }
}
