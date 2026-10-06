import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { SITE_NAME, TAGLINE } from "@/lib/constants";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `${SITE_NAME} · ${TAGLINE}`, template: `%s · ${SITE_NAME}` },
  description: "The hub for everything: share and download games, apps, extensions, Minecraft mods, 3D assets, art, music, fonts and more.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Navbar />
        <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
        <footer className="mt-16 border-t border-line py-8 text-center text-sm text-muted">
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/browse" className="hover:text-text">Browse everything</Link>
            <Link href="/launchers" className="hover:text-text">Minecraft launchers</Link>
            <Link href="/developers/launchers" className="hover:text-text">Launcher API</Link>
            <Link href="/pack" className="hover:text-text">Pack builder</Link>
          </div>
          <p className="mt-3">{SITE_NAME}: {TAGLINE.toLowerCase()}.</p>
          <p className="mt-1 text-xs">Not affiliated with Mojang, Microsoft or any game publisher. Creators own what they upload.</p>
        </footer>
      </body>
    </html>
  );
}
