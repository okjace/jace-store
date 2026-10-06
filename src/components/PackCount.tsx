"use client";
import { useEffect, useState } from "react";
import { onPackChange, readPack } from "@/lib/pack";

export default function PackCount() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const update = () => setN(readPack().length);
    update();
    return onPackChange(update);
  }, []);
  return <span className="rounded bg-panel px-1.5 text-xs text-brand">{n}</span>;
}
