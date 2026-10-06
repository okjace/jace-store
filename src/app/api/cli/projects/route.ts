import { ApiError, handler, readJson, requireApiUser } from "@/lib/apiAuth";
import { PROJECT_TYPES, siteUrl, slugify } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";

/** GET: your projects. */
export const GET = handler(async (req) => {
  const userId = await requireApiUser(req);
  const { data } = await createAdminClient()
    .from("projects")
    .select("id, slug, type, title, summary, downloads, updated_at")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false });
  return (data ?? []).map((p) => ({ ...p, page_url: `${siteUrl()}/project/${p.slug}` }));
});

/** POST: create a project. Body: { type, title, summary, slug?, description?, categories?, source_url?, issues_url?, license? } */
export const POST = handler(async (req) => {
  const userId = await requireApiUser(req);
  const b = await readJson<Record<string, unknown>>(req);
  const type = String(b.type ?? "");
  if (!PROJECT_TYPES.some((t) => t.id === type)) {
    throw new ApiError(400, `type must be one of: ${PROJECT_TYPES.map((t) => t.id).join(", ")}`);
  }
  const title = String(b.title ?? "").trim();
  const summary = String(b.summary ?? "").trim();
  if (title.length < 2) throw new ApiError(400, "title is required");
  if (summary.length < 3) throw new ApiError(400, "summary is required (3-256 chars)");
  const slug = slugify(String(b.slug ?? title));
  const { data, error } = await createAdminClient()
    .from("projects")
    .insert({
      owner_id: userId,
      type,
      title,
      summary,
      slug,
      description: String(b.description ?? ""),
      categories: Array.isArray(b.categories) ? b.categories.map(String) : [],
      source_url: (b.source_url as string) || null,
      issues_url: (b.issues_url as string) || null,
      license: (b.license as string) || null,
    })
    .select("id, slug, type, title")
    .single();
  if (error) throw new ApiError(400, error.code === "23505" ? `Slug "${slug}" is taken` : error.message);
  return { ...data, page_url: `${siteUrl()}/project/${data.slug}` };
});
