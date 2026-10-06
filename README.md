# Jace Store

A community store for Minecraft **mods, resource packs, shaders, data packs, modpacks, plugins, worlds and apps**.
Next.js (App Router) on **Vercel**, with **Supabase** for auth, Postgres and file storage.

## Features
- Browse/search with filters (type, loader/platform, Minecraft version, category) and sorting
- Accounts (email/password, GitHub, Jace) and creator dashboard
- Projects with Markdown descriptions, icons, and multiple versions (release/beta/alpha)
- Uploads go **directly from the browser to Supabase Storage** (up to 500 MB, bypassing Vercel's body limit); SHA-1 and SHA-512 are computed on upload
- Auto-fills version info from `fabric.mod.json`, `quilt.mod.json`, `mods.toml`, `neoforge.mods.toml`, `plugin.yml` and `.mrpack` files
- Download counts
- **Launcher support**
  - Per-launcher install instructions on every project (Prism/MultiMC, Modrinth App, ATLauncher, CurseForge App, official launcher)
  - "Copy URL" for importing modpacks into Prism/MultiMC by URL
  - **Pack builder**: pick mods/resource packs/shaders and export a `.mrpack` for Prism, ATLauncher or the Modrinth App
  - **Modrinth-v2-style public API** at `/api/v2` (search, projects, versions, hash lookup, update checks) — see `/launchers`

## Setup

### 1. Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query**, paste [`supabase/schema.sql`](supabase/schema.sql), run it. It creates the tables, row-level-security policies, and the `project-files` and `icons` storage buckets.
3. **Authentication → URL Configuration**: set *Site URL* to your Vercel URL and add `http://localhost:3000/**` and `https://YOUR-SITE.vercel.app/**` to *Redirect URLs*.
4. (Optional) **Authentication → Providers**: enable GitHub and/or Discord.
5. Storage upload limit: the bucket allows 500 MB, but Supabase's global limit is 50 MB on the Free plan. Raise it under **Storage → Settings** on a paid plan if you need bigger files.

### 2. Run locally
```bash
cp .env.example .env.local   # fill in values from Supabase → Project Settings → API
npm install
npm run dev
```

### 3. Deploy to Vercel
```bash
npx vercel
```
Or import the repo at [vercel.com/new](https://vercel.com/new). Add the env vars from `.env.example`
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`) in *Project → Settings → Environment Variables*.

## Notes
- The Modrinth App only downloads `.mrpack` files from an allow-list of hosts (Modrinth, GitHub, …), so packs generated here are best imported with **Prism Launcher** or **ATLauncher**.
- There is no moderation queue yet: anything uploaded is public immediately. Consider adding reports/moderation before opening it up widely.
