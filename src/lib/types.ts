import type { ProjectType } from "./constants";

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  slug: string;
  owner_id: string;
  type: ProjectType;
  title: string;
  summary: string;
  description: string;
  categories: string[];
  loaders: string[];
  game_versions: string[];
  icon_url: string | null;
  gallery: string[];
  source_url: string | null;
  issues_url: string | null;
  license: string | null;
  downloads: number;
  download_mode: "latest" | "primary" | "all";
  primary_version_id: string | null;
  created_at: string;
  updated_at: string;
  owner?: Pick<Profile, "username" | "display_name" | "avatar_url"> | null;
}

export interface FileRow {
  id: string;
  version_id: string;
  filename: string;
  storage_path: string | null;
  url: string;
  size: number | null;
  sha1: string | null;
  sha512: string | null;
  is_primary: boolean;
  is_external: boolean;
  label: string | null;
}

export interface Version {
  id: string;
  project_id: string;
  version_number: string;
  name: string;
  changelog: string;
  release_channel: "release" | "beta" | "alpha";
  loaders: string[];
  game_versions: string[];
  /** See lib/dependencies.ts. Empty until migration 008 is run. */
  dependencies?: import("./dependencies").Dependency[];
  downloads: number;
  created_at: string;
  files?: FileRow[];
}
