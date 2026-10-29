import { ApiError } from "./apiAuth";
import { createAdminClient } from "./supabase/admin";

export async function ownedCollection(userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "Collection not found");
  const { data } = await createAdminClient().from("collections").select("*").eq("id", id).maybeSingle();
  if (!data) throw new ApiError(404, "Collection not found");
  if (data.owner_id !== userId) throw new ApiError(403, "That's not your collection");
  return data;
}

export async function touch(id: string) {
  await createAdminClient().from("collections").update({ updated_at: new Date().toISOString() }).eq("id", id);
}
