import Link from "next/link";
import { siteUrl } from "@/lib/constants";

export const metadata = { title: "Launcher support & API" };

const LAUNCHERS = [
  {
    name: "Prism Launcher / MultiMC",
    body: (
      <>
        <b>Modpacks:</b> Add Instance → Import → paste a modpack&apos;s file URL (the <i>Copy URL</i> button on any project) or
        choose a downloaded <code>.mrpack</code>/<code>.zip</code>. <b>Mods, resource packs, shaders:</b> Edit instance → the matching tab → drag the file in.
      </>
    ),
  },
  {
    name: "Modrinth App",
    body: <>Import any <code>.mrpack</code> — including ones made with the <Link href="/pack" className="text-brand underline">pack builder</Link> — via Create instance → Import. Drag individual files onto an instance&apos;s Content page.</>,
  },
  {
    name: "ATLauncher",
    body: <>Use the Import tab with a downloaded <code>.mrpack</code> or <code>.zip</code>. Individual files go in the instance folder (Open Folder).</>,
  },
  {
    name: "CurseForge App",
    body: <>Open a profile&apos;s folder and drop files into <code>mods/</code>, <code>resourcepacks/</code> or <code>shaderpacks/</code>.</>,
  },
  {
    name: "Official Minecraft Launcher",
    body: <>Install Fabric/Forge/NeoForge with its installer, then copy files into <code>.minecraft/mods</code> (or <code>resourcepacks</code>, <code>shaderpacks</code>).</>,
  },
];

export default function Launchers() {
  const base = `${siteUrl()}/api/v2`;
  const endpoints: [string, string, string][] = [
    ["GET", "/search?query=sodium&facets=[[\"project_type:mod\"],[\"versions:1.21.1\"]]&limit=10", "Search projects (Modrinth facet syntax)"],
    ["GET", "/project/{id|slug}", "Project details"],
    ["GET", "/projects?ids=[\"slug-a\",\"slug-b\"]", "Several projects at once"],
    ["GET", "/project/{id|slug}/version?loaders=[\"fabric\"]&game_versions=[\"1.21.1\"]", "List versions, filterable"],
    ["GET", "/version/{id}", "One version with files and hashes"],
    ["GET", "/version_file/{sha1}?algorithm=sha1", "Identify a file on disk by hash"],
    ["POST", "/version_files  {\"hashes\":[…],\"algorithm\":\"sha1\"}", "Identify many files at once"],
    ["POST", "/version_file/{sha1}/update  {\"loaders\":[…],\"game_versions\":[…]}", "Check a file for updates"],
    ["GET", "/tag/{game_version|loader|project_type|category}", "Tag lists"],
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <section>
        <h1 className="text-3xl font-black">Launcher support</h1>
        <p className="mt-2 text-muted">
          Every project page has an <b>Install with a launcher</b> panel with step-by-step instructions for the launcher you use.
          Here&apos;s the overview.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {LAUNCHERS.map((l) => (
            <div key={l.name} className="card p-5 text-sm">
              <h2 className="mb-1 font-bold">{l.name}</h2>
              <p className="text-muted">{l.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-xl font-bold">Build a modpack</h2>
        <p className="mt-1 text-sm text-muted">
          Pick mods, resource packs and shaders from the store, choose a Minecraft version and loader, and download a
          standard <code>.mrpack</code>. The pack references files by URL and SHA-1/SHA-512 hash, so launchers verify every download.
        </p>
        <Link href="/pack" className="btn-primary mt-4">Open pack builder</Link>
      </section>

      <section id="api">
        <h2 className="text-2xl font-black">Public API</h2>
        <p className="mt-2 text-muted">
          A read-only JSON API modelled on Modrinth&apos;s v2 API, so launcher and update-checker code written for Modrinth can
          point at this store by changing the base URL. No key needed; CORS is open.
        </p>
        <pre className="card mt-4 overflow-x-auto p-4 text-sm">{base}</pre>
        <div className="card mt-4 divide-y divide-line text-sm">
          {endpoints.map(([m, path, desc]) => (
            <div key={path} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:gap-4">
              <span className={`chip w-14 justify-center ${m === "GET" ? "chip-on" : "text-amber-300"}`}>{m}</span>
              <code className="flex-1 break-all text-text">{path}</code>
              <span className="text-muted">{desc}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted">
          File URLs in responses go through <code>/api/download/&#123;fileId&#125;</code> (counts the download, then redirects).
          Each file also has <code>direct_url</code>. Modpacks: <code>GET /api/mrpack?v=&#123;versionIds&#125;&amp;mc=1.21.1&amp;loader=fabric&amp;loader_version=…</code>
        </p>
      </section>
    </div>
  );
}
