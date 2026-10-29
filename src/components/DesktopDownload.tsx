"use client";
import { useEffect, useState } from "react";
import type { DesktopAsset } from "@/lib/desktopRelease";

/** Big download button for the visitor's OS (falls back to the full list below it). */
export default function DesktopDownload({ assets }: { assets: DesktopAsset[] }) {
  const [pick, setPick] = useState<DesktopAsset | null>(null);
  useEffect(() => {
    const ua = navigator.userAgent;
    const os = /Windows/i.test(ua) ? "windows" : /Mac/i.test(ua) ? "macos" : /Linux|X11/i.test(ua) && !/Android/i.test(ua) ? "linux" : null;
    const mine = assets.filter((a) => a.os === os);
    // Browsers can't reliably tell Apple Silicon from Intel; Apple Silicon is the default for new Macs
    setPick(mine.find((a) => /arm64/.test(a.name)) ?? mine[0] ?? null);
  }, [assets]);
  if (!pick) return <a href="#downloads" className="btn-primary px-6! py-3! text-base">Choose a download below</a>;
  return <a href={pick.url} className="btn-primary px-6! py-3! text-base">Download for {pick.label}</a>;
}
