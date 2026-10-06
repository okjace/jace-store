"use client";
import { useEffect, useState } from "react";
import { onPackChange, readPack, writePack, type PackItem } from "@/lib/pack";

export default function AddToPackButton({ item }: { item: PackItem }) {
  const [inPack, setInPack] = useState(false);
  useEffect(() => {
    const update = () => setInPack(readPack().some((i) => i.versionId === item.versionId));
    update();
    return onPackChange(update);
  }, [item.versionId]);

  function toggle() {
    const items = readPack();
    if (inPack) {
      writePack(items.filter((i) => i.versionId !== item.versionId));
    } else {
      // Only one version per project in a pack.
      writePack([...items.filter((i) => i.projectSlug !== item.projectSlug), item]);
    }
  }

  return (
    <button onClick={toggle} className="btn-ghost px-3! py-1.5! text-xs" type="button">
      {inPack ? "✓ In pack" : "+ Pack"}
    </button>
  );
}
