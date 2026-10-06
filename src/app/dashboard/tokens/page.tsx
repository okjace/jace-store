import Link from "next/link";
import { requireUser } from "@/lib/requireUser";
import { siteUrl } from "@/lib/constants";
import TokenManager from "@/components/TokenManager";

export const metadata = { title: "CLI & API tokens" };

export default async function TokensPage() {
  const { supabase } = await requireUser("/dashboard/tokens");
  const { data: tokens } = await supabase
    .from("api_tokens")
    .select("id, name, prefix, created_at, last_used_at")
    .order("created_at", { ascending: false });
  const site = siteUrl();

  const Block = ({ children }: { children: string }) => (
    <pre className="card overflow-x-auto p-4 text-xs leading-relaxed">{children}</pre>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link href="/dashboard" className="text-sm text-muted hover:text-text">← Dashboard</Link>
        <h1 className="mt-2 text-3xl font-black">CLI & API tokens</h1>
        <p className="mt-1 text-muted">
          Let scripts, CI or an AI assistant publish updates for you. A token can manage <b>your</b> projects:
          create them, edit them, publish versions, upload files and add links. Revoke it any time.
        </p>
      </div>

      <TokenManager tokens={tokens ?? []} />

      <section className="space-y-3">
        <h2 className="text-xl font-bold">1. Get the CLI</h2>
        <p className="text-sm text-muted">One file, needs Node.js 18+, no dependencies.</p>
        <Block>{`curl -fsSL ${site}/jace-store.mjs -o jace-store.mjs
node jace-store.mjs login jst_your_token_here`}</Block>
        <p className="text-sm text-muted">
          Or skip <code>login</code> and set <code>JACE_STORE_TOKEN</code> in the environment, which is handy for CI and AI agents.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">2. Publish an update</h2>
        <Block>{`# upload a file
node jace-store.mjs publish my-mod --version 1.2.0 \\
  --game-versions 1.21.1 --loaders fabric \\
  --changelog-file CHANGELOG.md --file build/libs/my-mod-1.2.0.jar

# or use custom download links (label after a |)
node jace-store.mjs publish my-app --version 2.0.0 \\
  --link "https://github.com/me/app/releases/download/v2.0.0/app-setup.exe|Windows" \\
  --link "https://github.com/me/app/releases/download/v2.0.0/app.dmg|macOS"`}</Block>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">3. Tell your AI about it</h2>
        <p className="text-sm text-muted">Paste this into your AI assistant&apos;s instructions (CLAUDE.md, system prompt, etc.):</p>
        <Block>{`To publish updates to Jace Store, use the CLI at ./jace-store.mjs (token in JACE_STORE_TOKEN).
Run \`node jace-store.mjs help\` for all commands. Add --json to any command for machine-readable output.
Typical release: node jace-store.mjs publish <slug> --version <x.y.z> --changelog "<notes>" --file <path> [--link "<url>|<label>"]
Minecraft projects also need --game-versions and --loaders. Run \`node jace-store.mjs projects --json\` to list slugs.`}</Block>
      </section>

      <section className="space-y-2 text-sm text-muted">
        <h2 className="text-xl font-bold text-text">Raw API</h2>
        <p>Every CLI command is a plain HTTP call with <code>Authorization: Bearer &lt;token&gt;</code> under <code>{site}/api/cli</code>:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><code>GET /me</code> · <code>GET|POST /projects</code> · <code>GET|PATCH /projects/&#123;slug&#125;</code></li>
          <li><code>POST /projects/&#123;slug&#125;/versions</code> · <code>PATCH|DELETE /versions/&#123;id&#125;</code></li>
          <li><code>POST /versions/&#123;id&#125;/upload-url</code> → PUT bytes → <code>POST /versions/&#123;id&#125;/files</code> (kind: upload | link)</li>
          <li><code>DELETE /files/&#123;id&#125;</code></li>
        </ul>
      </section>
    </div>
  );
}
