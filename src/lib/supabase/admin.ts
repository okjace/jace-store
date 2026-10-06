import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Server-only: never import this from a client component.
 * Used to create users for sign-in providers Supabase can't talk to directly.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
