-- Jace Store: dependencies for every version. A project lists Modrinth / CurseForge mods once
-- (projects.auto_dependencies) and each of its versions gets the matching release of each one for
-- its Minecraft versions and loaders. Run once in Supabase SQL Editor (after 012). Safe to re-run.
alter table public.projects
  add column if not exists auto_dependencies jsonb not null default '[]'::jsonb;
do $$ begin
  alter table public.projects
    add constraint projects_auto_dependencies_is_array check (jsonb_typeof(auto_dependencies) = 'array');
exception when duplicate_object then null; end $$;
notify pgrst, 'reload schema';
