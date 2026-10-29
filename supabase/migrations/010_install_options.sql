-- Jace Store: per-file install options for the Jace Store desktop app.
--   install_mode  auto    -> the app decides from the file type (.deb, .msi, .dmg... get installed; .exe installers get opened)
--                 install -> the app installs it for you (package manager, Applications folder, shortcuts)
--                 open    -> the app downloads it, then opens it (runs the installer / opens the disk image)
--   platform / arch -> which computers the file is for. NULL = detect from the filename.
-- Run once in Supabase SQL Editor (after 009). Safe to re-run.

alter table public.files add column if not exists install_mode text not null default 'auto';
alter table public.files drop constraint if exists files_install_mode_check;
alter table public.files add constraint files_install_mode_check check (install_mode in ('auto', 'install', 'open'));

alter table public.files add column if not exists platform text;
alter table public.files drop constraint if exists files_platform_check;
alter table public.files add constraint files_platform_check check (platform is null or platform in
  ('any', 'windows', 'macos', 'linux', 'linux-deb', 'linux-rpm', 'linux-arch', 'android'));

alter table public.files add column if not exists arch text;
alter table public.files drop constraint if exists files_arch_check;
alter table public.files add constraint files_arch_check check (arch is null or arch in ('any', 'x64', 'arm64'));

notify pgrst, 'reload schema';
