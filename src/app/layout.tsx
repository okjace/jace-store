import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { SITE_NAME } from "@/lib/constants";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: "Share and download Minecraft mods, resource packs, shaders, modpacks and apps.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Navbar />
        <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
        <footer className="mt-16 border-t border-line py-8 text-center text-sm text-muted">
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/launchers" className="hover:text-text">Launcher support</Link>
            <Link href="/launchers#api" className="hover:text-text">API</Link>
            <Link href="/pack" className="hover:text-text">Pack builder</Link>
          </div>
          <p className="mt-3">{SITE_NAME} is not affiliated with Mojang or Microsoft.</p>
        </footer>
      </body>
    </html>
  );
}
