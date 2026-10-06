import { handler, requireApiUser } from "@/lib/apiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const GET = handler(async (req) => {
  const userId = await requireApiUser(req);
  const { data } = await createAdminClient().from("profiles").select("id, username, display_name").eq("id", userId).single();
  return data;
});
