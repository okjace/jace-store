import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_RE } from "@/lib/api";
import { optionalApiUser } from "@/lib/apiAuth";
import { siteUrl } from "@/lib/constants";
import { privateFileUrl } from "@/lib/fileStorage";
import { hasAccess } from "@/lib/payments";
import { isPaid, priceLabel } from "@/lib/pricing";

const CORS = { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" };

/**
 * GET: count the download and send the file. Paid projects' files only go to the people who bought
 * them (signed in on the website, or `Authorization: Bearer jst_…` from the app / CLI), as a link
 * that works for 5 minutes.
 */
export async function GET(req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  if (!UUID_RE.test(fileId)) return new NextResponse("Not found", { status: 404 });
  const admin = createAdminClient();
  const { data: file } = await admin.from("files")
    .select("*, version:versions(project:projects!versions_project_id_fkey(*))")
    .eq("id", fileId).maybeSingle();
  if (!file) return new NextResponse("Not found", { status: 404 });
  const project = file.version?.project;
  if (project && isPaid(project)) {
    const userId = await optionalApiUser(req);
    if (!(await hasAccess(userId, project))) {
      const page = `${siteUrl()}/project/${project.slug}`;
      if ((req.headers.get("accept") ?? "").includes("text/html")) {
        return NextResponse.redirect(userId ? `${page}?buy=1` : `${siteUrl()}/login?next=${encodeURIComponent(`/project/${project.slug}`)}`, { status: 302, headers: CORS });
      }
      return NextResponse.json({
        error: userId ? "payment_required" : "sign_in_required",
        description: `${project.title} is a paid project (${priceLabel(project)}). ${userId ? "Buy it" : "Sign in and buy it"} on Jace Store: ${page}`,
        page_url: page,
      }, { status: userId ? 402 : 401, headers: CORS });
    }
  }
  await createPublicClient().rpc("increment_downloads", { file_id: fileId });
  const target = file.storage === "private" ? await privateFileUrl(file.storage_path, file.filename) : file.url;
  return NextResponse.redirect(target, { status: 302, headers: CORS });
}
