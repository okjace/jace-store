import Link from "next/link";
import { formatBytes, timeAgo } from "@/lib/constants";
import { DESKTOP_REPO, latestDesktopRelease } from "@/lib/desktopRelease";
import DesktopDownload from "@/components/DesktopDownload";

export const metadata = { title: "Desktop app", description: "Install apps and games from Jace Store, Flathub, winget, Homebrew and your distro in one app." };
export const revalidate = 600;

export default async function DesktopPage() {
  const rel = await latestDesktopRelease();
  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <section className="card relative overflow-hidden p-8 sm:p-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(74,222,128,.18),transparent_50%)]" />
        <div className="relative">
          <span className="chip chip-on mb-4">Jace Store for desktop</span>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Every app, one store.</h1>
          <p className="mt-4 max-w-2xl text-lg text-muted">
            Install and update apps and games from Jace Store, plus the software sources your computer already trusts:
            winget on Windows, Homebrew on Mac, and Flathub, Snap and your distro&apos;s packages on Linux.
          </p>
          {rel ? (
            <div className="mt-7">
              <DesktopDownload assets={rel.assets} />
              <p className="mt-3 text-sm text-muted">
                Version {rel.version} · released {timeAgo(rel.published_at)} ·{" "}
                <a href={rel.url} className="underline hover:text-text">release notes</a>
              </p>
            </div>
          ) : (
            <p className="mt-7 text-muted">The first release is on its way. Check back soon.</p>
          )}
        </div>
      </section>

      {rel && (
        <section id="downloads" className="card divide-y divide-line">
          {rel.assets.map((a) => (
            <a key={a.name} href={a.url} className="flex items-center gap-4 p-4 text-sm hover:bg-panel-2">
              <b className="w-48 shrink-0">{a.label}</b>
              <span className="flex-1 truncate text-muted">{a.name}</span>
              <span className="text-muted">{formatBytes(a.size)}</span>
            </a>
          ))}
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["One-click installs", "Jace Store picks the right file for your computer and installs it: .msi and portable apps on Windows, disk images and .app bundles on Mac, .deb / .rpm / pacman packages, AppImages and Flatpaks on Linux."],
          ["Your distro, understood", "On Linux it knows if you're on Ubuntu, Fedora, Arch, openSUSE and more, and uses the right package manager, Flathub, Snap and even the AUR."],
          ["Updates in one place", "See which installed apps have updates and update them with one click. The app updates itself too."],
        ].map(([h, b]) => (
          <div key={h} className="card p-5">
            <h2 className="font-bold">{h}</h2>
            <p className="mt-1 text-sm text-muted">{b}</p>
          </div>
        ))}
      </section>

      <section className="space-y-2 text-sm text-muted">
        <h2 className="text-xl font-bold text-text">Installing</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li><b className="text-text">Windows:</b> run the <code>.exe</code>; it sets itself up (Start menu, desktop shortcut, Installed apps). If SmartScreen warns, click <i>More info → Run anyway</i>.</li>
          <li><b className="text-text">macOS:</b> open the downloaded <i>Jace Store.app</i>; it moves itself to Applications. First time: right-click → <i>Open</i>.</li>
          <li><b className="text-text">Linux:</b> make the AppImage executable and run it; it adds itself to your app menu.</li>
        </ul>
        <p>
          Publishing apps? Choose per file whether the app <b className="text-text">installs it</b> or <b className="text-text">downloads and opens it</b> on your
          project&apos;s Manage page. Source code: <a className="underline hover:text-text" href={`https://github.com/${DESKTOP_REPO}/tree/master/desktop`}>GitHub</a>.
          {" "}<Link href="/browse?group=software" className="underline hover:text-text">Browse software</Link>
        </p>
      </section>
    </div>
  );
}
