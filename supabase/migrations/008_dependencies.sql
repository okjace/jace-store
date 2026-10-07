-- Jace Store: version dependencies (e.g. "needs Fabric API and e4all").
-- Run once in Supabase SQL Editor (after 007). Safe to re-run.
--
-- Each entry: { "source": "jace" | "modrinth", "project": "<slug>",
--               "type": "required" | "optional" | "incompatible" | "embedded" }
alter table public.versions
  add column if not exists dependencies jsonb not null default '[]'::jsonb;

do $$ begin
  alter table public.versions
    add constraint versions_dependencies_is_array check (jsonb_typeof(dependencies) = 'array');
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
