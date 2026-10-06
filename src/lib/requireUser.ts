import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireUser(next: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return { supabase, user };
}
