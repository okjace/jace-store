import ProjectForm from "@/components/ProjectForm";
import { requireUser } from "@/lib/requireUser";

export const metadata = { title: "Upload" };

export default async function NewProject() {
  const { user } = await requireUser("/new");
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-3xl font-black">Create a project</h1>
      <p className="mb-6 text-muted">Games, apps, mods, assets, art, music: anything goes. Set up the page first, then upload files on the next step.</p>
      <ProjectForm userId={user.id} />
    </div>
  );
}
