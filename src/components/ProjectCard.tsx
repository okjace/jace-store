import Link from "next/link";
import type { Project } from "@/lib/types";
import { formatNumber, timeAgo, typeInfo } from "@/lib/constants";
import ProjectIcon from "./ProjectIcon";

export default function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href={`/project/${project.slug}`}
      className="card flex gap-4 p-4 transition hover:border-muted"
    >
      <ProjectIcon url={project.icon_url} title={project.title} type={project.type} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h3 className="truncate font-bold">{project.title}</h3>
          {project.owner && <span className="text-sm text-muted">by {project.owner.username}</span>}
        </div>
        <p className="mt-0.5 line-clamp-2 text-sm text-muted">{project.summary}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="chip chip-on">{typeInfo(project.type).label}</span>
          {project.loaders.slice(0, 3).map((l) => (
            <span key={l} className="chip capitalize">{l}</span>
          ))}
          {project.categories.slice(0, 3).map((c) => (
            <span key={c} className="chip">{c}</span>
          ))}
        </div>
      </div>
      <div className="hidden shrink-0 text-right text-sm text-muted sm:block">
        <div><b className="text-text">{formatNumber(project.downloads)}</b> downloads</div>
        <div className="mt-1">{timeAgo(project.updated_at)}</div>
      </div>
    </Link>
  );
}
