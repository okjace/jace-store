import { ApiError, handler, readJson, requireApiUser } from "@/lib/apiAuth";
import { checkoutUrl, purchaseFor } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";

/** POST { slug, amount_cents? (pay what you want) } -> { url }: Stripe's checkout page for a paid project. */
export const POST = handler(async (req) => {
  const userId = await requireApiUser(req);
  const b = await readJson<{ slug?: string; amount_cents?: number }>(req);
  const { data: project } = await createAdminClient().from("projects").select("*").eq("slug", String(b.slug ?? "")).maybeSingle();
  if (!project) throw new ApiError(404, "Project not found");
  if (await purchaseFor(userId, project.id)) throw new ApiError(409, "You already have this one");
  return { url: await checkoutUrl(userId, project, b.amount_cents == null ? undefined : Math.round(Number(b.amount_cents))) };
});
