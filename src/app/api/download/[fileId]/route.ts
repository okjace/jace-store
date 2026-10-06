import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/api";

export async function GET(_req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  if (!UUID_RE.test(fileId)) return new NextResponse("Not found", { status: 404 });
  const supabase = createPublicClient();
  const { data: file } = await supabase.from("files").select("url").eq("id", fileId).maybeSingle();
  if (!file) return new NextResponse("Not found", { status: 404 });
  await supabase.rpc("increment_downloads", { file_id: fileId });
  return NextResponse.redirect(file.url, {
    status: 302,
    headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" },
  });
}
