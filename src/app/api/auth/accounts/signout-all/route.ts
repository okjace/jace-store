import { handler } from "@/lib/apiAuth";
import { forgetDevice, markSignedOut } from "@/lib/jaceDevice";
import { createClient } from "@/lib/supabase/server";

/** POST: sign out and forget every Jace account on this device. */
export const POST = handler(async () => {
  await (await createClient()).auth.signOut();
  await forgetDevice();
  await markSignedOut(true);
  return { signed_out: true };
});
