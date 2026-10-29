/** Is this a picture the user uploaded to Jace Store's own icons bucket (their folder)? */
export function isOwnImage(userId: string, url: unknown): boolean {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return typeof url === "string" && !!base && url.startsWith(`${base}/storage/v1/object/public/icons/${userId}/`) && !url.includes("..");
}
