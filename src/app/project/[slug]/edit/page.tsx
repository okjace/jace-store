import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/requireUser";
import type { Project, Version } from "@/lib/types";
import ProjectForm from "@/components/ProjectForm";
import VersionUploader from "@/components/VersionUploader";
import ManageVersions from "@/components/ManageVersions";

export const metadata = { title: "Manage project" };

export default async function EditProject({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { slug } = await params;
  const { new: isNew } = await searchParams;
  const { supabase, user } = await requireUser(`/project/${slug}/edit`);
  const { data: project } = await supabase.from("projects").select("*").eq("slug", slug).maybeSingle();
  if (!project || project.owner_id !== user.id) notFound();
  const { data: versions } = await supabase
    .from("versions").select("*, files(*)").eq("project_id", project.id).order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-black">{project.title}</h1>
        <Link href={`/project/${slug}`} className="btn-ghost">View page →</Link>
      </div>
      {isNew && <p className="card border-brand/40 p-4 text-sm text-brand">Project created! Now upload your first version.</p>}
      <VersionUploader project={project as Project} userId={user.id} />
      <ManageVersions project={project as Project} versions={(versions ?? []) as Version[]} />
      <details className="group" open={false}>
        <summary className="cursor-pointer text-lg font-bold">Project settings</summary>
        <div className="mt-4"><ProjectForm project={project as Project} userId={user.id} /></div>
      </details>
    </div>
  );
}
