-- Jace Store: "hub for everything" update.
-- Run once in Supabase SQL Editor (after schema.sql). Safe to re-run.

-- 1. Allow the new project types.
alter table public.projects drop constraint if exists projects_type_check;
alter table public.projects add constraint projects_type_check check (type in (
  'mod','resourcepack','shader','datapack','modpack','plugin','world',
  'game','gamemod',
  'app','extension','script','theme',
  'asset','art','audio','font','template',
  'other'));

-- 2. Screenshot / preview gallery on every project.
alter table public.projects add column if not exists gallery text[] not null default '{}';

-- 3. Allow bigger images (gallery screenshots, wallpapers) in the image bucket.
update storage.buckets set file_size_limit = 10485760 where id = 'icons';  -- 10 MB

-- Make the Data API see the changes right away.
notify pgrst, 'reload schema';
