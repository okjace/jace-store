import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/requireUser";
import type { Project, Version } from "@/lib/types";
import ProjectForm from "@/components/ProjectForm";
import VersionUploader from "@/components/VersionUploader";
import ManageVersions from "@/components/ManageVersions";
import DownloadSettings from "@/components/DownloadSettings";

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
      <nav className="flex flex-wrap gap-2 text-sm">
        <a href="#upload" className="chip hover:text-text">Upload version</a>
        <a href="#versions" className="chip hover:text-text">Versions</a>
        <a href="#download" className="chip hover:text-text">Download button</a>
        <a href="#settings" className="chip hover:text-text">Project settings</a>
      </nav>
      <VersionUploader project={project as Project} userId={user.id} />
      <div id="versions" className="scroll-mt-24">
        <ManageVersions project={project as Project} versions={(versions ?? []) as Version[]} />
      </div>
      <div id="download" className="scroll-mt-24">
        <DownloadSettings project={project as Project} versions={(versions ?? []) as Version[]} />
      </div>
      <section id="settings" className="scroll-mt-24 space-y-3">
        <h2 className="text-lg font-bold">Project settings</h2>
        <ProjectForm project={project as Project} userId={user.id} />
      </section>
    </div>
  );
}
