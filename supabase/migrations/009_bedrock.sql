-- Jace Store: Minecraft Bedrock section (add-ons, texture packs, worlds, skin packs, world templates).
-- Run once in Supabase SQL Editor (after 008). Safe to re-run.
alter table public.projects drop constraint if exists projects_type_check;
alter table public.projects add constraint projects_type_check check (type in (
  'mod','resourcepack','shader','datapack','modpack','plugin','world',
  'bedrock_addon','bedrock_texture','bedrock_world','bedrock_skin','bedrock_template',
  'game','gamemod',
  'app','extension','script','theme',
  'asset','art','audio','font','template',
  'other'));

notify pgrst, 'reload schema';
