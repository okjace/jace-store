import { guardPost } from "@/lib/accountModeration";
import { ApiError, handler, ownedProject, readJson, requireApiUser } from "@/lib/apiAuth";
import { makeFilesPrivate } from "@/lib/fileStorage";
import { paymentsReady, refreshSeller } from "@/lib/payments";
import { isPaid, MAX_PRICE_CENTS, MIN_PRICE_CENTS, priceOut, type PriceType } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;
type Ctx = { params: Promise<{ slug: string }> };

/**
 * PUT { type: "free" | "one_time" | "subscription", price_cents?, pay_what_you_want?, interval?: "month" | "year" }
 * Making a project paid needs a connected Stripe account (Settings → Selling), moves its uploaded
 * files to private storage, and isn't possible while it has link files (anyone could open those).
 */
export const PUT = handler(async (req, { params }: Ctx) => {
  const userId = await requireApiUser(req);
  const project = await ownedProject(userId, (await params).slug);
  if (!("price_type" in project)) throw new ApiError(503, "Jace Store's database needs migration 014 first");
  const b = await readJson<Record<string, unknown>>(req);
  const type = String(b.type ?? "free") as PriceType;
  if (!["free", "one_time", "subscription"].includes(type)) throw new ApiError(400, "type must be free, one_time or subscription");
  await guardPost(userId, "project");

  const patch: Record<string, unknown> = { price_type: type, price_cents: null, pay_what_you_want: false, sub_interval: null };
  if (type !== "free") {
    if (!paymentsReady()) throw new ApiError(503, "Payments aren't set up on Jace Store yet.");
    const cents = Math.round(Number(b.price_cents));
    if (!(cents >= MIN_PRICE_CENTS && cents <= MAX_PRICE_CENTS)) throw new ApiError(400, "The price must be between $1 and $1,000");
    const seller = await refreshSeller(userId);
    if (!seller?.charges_enabled) throw new ApiError(409, "Connect your Stripe account first (Settings → Selling), so you can be paid.");
    const admin = createAdminClient();
    const { data: versions } = await admin.from("versions").select("files(filename, is_external)").eq("project_id", project.id);
    const links = (versions ?? []).flatMap((v) => (v.files ?? []) as { filename: string; is_external: boolean }[]).filter((f) => f.is_external);
    if (links.length) {
      throw new ApiError(400, `Remove the link files first (anyone could open them): ${links.slice(0, 5).map((f) => f.filename).join(", ")}${links.length > 5 ? "…" : ""}. Upload the files instead.`);
    }
    patch.price_cents = cents;
    if (type === "one_time") patch.pay_what_you_want = !!b.pay_what_you_want;
    if (type === "subscription") {
      const interval = String(b.interval ?? "month");
      if (interval !== "month" && interval !== "year") throw new ApiError(400, "interval must be month or year");
      patch.sub_interval = interval;
    }
  }
  const { data, error } = await createAdminClient().from("projects").update(patch).eq("id", project.id).select().single();
  if (error) throw new ApiError(400, error.message);
  // paid now: its files stop being public
  const files = isPaid(data) ? await makeFilesPrivate(project.id) : { moved: 0, failed: [] };
  return { price: priceOut(data), files_made_private: files.moved, files_failed: files.failed };
});
