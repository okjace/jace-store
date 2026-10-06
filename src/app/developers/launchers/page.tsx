import Link from "next/link";
import { siteUrl } from "@/lib/constants";

export const metadata = { title: "Launcher API" };

export default function LauncherApiDocs() {
  const base = `${siteUrl()}/api/launcher/v1`;
  const Code = ({ children }: { children: string }) => <pre className="card overflow-x-auto p-4 text-xs leading-relaxed">{children}</pre>;
  const endpoints: [string, string, string][] = [
    ["GET", "/meta", "Types, loaders, categories, game versions and install folders, for building filter UI"],
    ["GET", "/search?q=&type=mod&loader=fabric&game_version=1.21.1&category=&sort=downloads&page=1&limit=20", "Browse/search. type, loader and category take comma lists"],
    ["GET", "/featured?type=mod&limit=10", "Popular, recently updated and newest rows for a home screen"],
    ["GET", "/project/{slug}", "Details: Markdown description, gallery, links, install info, featured version"],
    ["GET", "/project/{slug}/versions?loader=&game_version=&channel=release", "Version list filtered for an instance"],
    ["GET", "/project/{slug}/resolve?loader=fabric&game_version=1.21.1", "The one file to install for an instance, plus where it goes"],
    ["POST", "/updates", "Send file hashes from an instance; get back what's installed and available updates"],
    ["GET", "/openapi.json", "OpenAPI 3.1 spec, for generating clients"],
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <section>
        <Link href="/launchers" className="text-sm text-muted hover:text-text">← Launcher support</Link>
        <h1 className="mt-2 text-3xl font-black">Launcher API</h1>
        <p className="mt-2 text-muted">
          Put a Jace Store browser inside your Minecraft launcher. Search mods, resource packs, shaders, data packs, modpacks,
          plugins and worlds; resolve the right file for an instance; install it; and check for updates.
          Public, read-only, no key needed, CORS enabled.
        </p>
        <pre className="card mt-4 overflow-x-auto p-4 text-sm">{base}</pre>
        <p className="mt-2 text-sm text-muted">
          Spec: <a className="text-brand underline" href={`${base}/openapi.json`}>openapi.json</a>. Please send a descriptive
          <code className="mx-1">User-Agent</code> (e.g. <code>MyLauncher/2.1 (contact@example.com)</code>).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Endpoints</h2>
        <div className="card divide-y divide-line text-sm">
          {endpoints.map(([m, path, desc]) => (
            <div key={path} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:gap-4">
              <span className={`chip w-14 justify-center ${m === "GET" ? "chip-on" : "text-amber-300"}`}>{m}</span>
              <code className="flex-1 break-all text-text">{path}</code>
              <span className="text-muted sm:w-72">{desc}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Typical flow</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
          <li><b className="text-text">Build filters</b> from <code>/meta</code> (cache it; it rarely changes).</li>
          <li><b className="text-text">Show a browser</b> with <code>/featured</code> on open and <code>/search</code> as the user types, passing the instance&apos;s loader and game version so only compatible content shows.</li>
          <li><b className="text-text">Open a project</b> with <code>/project/&#123;slug&#125;</code>. The description is Markdown; <code>gallery</code> is a list of image URLs.</li>
          <li><b className="text-text">Install</b>: call <code>/resolve</code> with the instance&apos;s loader + version, download <code>file.url</code>, verify <code>file.hashes.sha1</code>, and save it to <code>install.path</code> inside the instance. Modpacks (<code>install.method = &quot;import_instance&quot;</code>) are <code>.mrpack</code>/<code>.zip</code> files to feed your instance importer.</li>
          <li><b className="text-text">Update</b>: hash the files in <code>mods/</code>, <code>resourcepacks/</code>, <code>shaderpacks/</code> and POST them to <code>/updates</code>.</li>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Example (JavaScript)</h2>
        <Code>{`const API = "${base}";
const instance = { loader: "fabric", game_version: "1.21.1" };

// 1. search
const res = await fetch(\`\${API}/search?\${new URLSearchParams({ q: "minimap", type: "mod", ...instance })}\`);
const { hits } = await res.json();

// 2. resolve + install
const r = await (await fetch(\`\${API}/project/\${hits[0].slug}/resolve?\${new URLSearchParams(instance)}\`)).json();
const bytes = new Uint8Array(await (await fetch(r.file.url)).arrayBuffer());
const sha1 = [...new Uint8Array(await crypto.subtle.digest("SHA-1", bytes))].map(b => b.toString(16).padStart(2, "0")).join("");
if (r.file.hashes && sha1 !== r.file.hashes.sha1) throw new Error("hash mismatch");
// write bytes to <instance>/\${r.install.path}`}</Code>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Example (Python)</h2>
        <Code>{`import hashlib, pathlib, requests

API = "${base}"
HEADERS = {"User-Agent": "MyLauncher/1.0"}
mods = pathlib.Path("~/.minecraft/mods").expanduser()

hashes = {hashlib.sha1(p.read_bytes()).hexdigest(): p for p in mods.glob("*.jar")}
r = requests.post(f"{API}/updates", headers=HEADERS, json={
    "hashes": list(hashes), "loader": "fabric", "game_version": "1.21.1",
}).json()

for h, info in r["results"].items():
    if info["update_available"]:
        f = info["latest_file"]
        print(f"{info['project']['title']}: {info['current_version']['version_number']} -> {info['latest_version']['version_number']}")
        data = requests.get(f["url"], headers=HEADERS).content
        assert hashlib.sha1(data).hexdigest() == f["hashes"]["sha1"]
        (mods / f["filename"]).write_bytes(data)
        hashes[h].unlink()`}</Code>
      </section>

      <section className="space-y-2 text-sm text-muted">
        <h2 className="text-xl font-bold text-text">Notes</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li><code>file.url</code> goes through the download counter and redirects to <code>direct_url</code>. Follow redirects.</li>
          <li>Files can be hosted elsewhere (<code>external: true</code>). Minecraft files always have SHA-1 and SHA-512 so you can verify them.</li>
          <li><code>resolve</code> defaults to <code>channel=release</code> and respects a version the creator pinned as primary, if it fits the instance.</li>
          <li>Responses are cached at the edge for 30-120 seconds; <code>/updates</code> is never cached.</li>
          <li>Need Modrinth-compatible endpoints instead? See <Link href="/launchers#api" className="text-brand underline">/api/v2</Link>.</li>
        </ul>
      </section>
    </div>
  );
}
