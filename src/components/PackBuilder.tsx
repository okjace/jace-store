"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { GAME_VERSIONS, typeInfo } from "@/lib/constants";
import { onPackChange, readPack, writePack, type PackItem } from "@/lib/pack";

const LOADERS = [
  { id: "fabric", label: "Fabric", hint: "e.g. 0.17.2 — see fabricmc.net/develop" },
  { id: "quilt", label: "Quilt", hint: "e.g. 0.29.2 — see quiltmc.org" },
  { id: "forge", label: "Forge", hint: "e.g. 52.1.0 — see files.minecraftforge.net" },
  { id: "neoforge", label: "NeoForge", hint: "e.g. 21.1.209 — see neoforged.net" },
  { id: "", label: "None (vanilla)", hint: "" },
];

export default function PackBuilder() {
  const [items, setItems] = useState<PackItem[]>([]);
  const [name, setName] = useState("My Pack");
  const [mc, setMc] = useState("1.21.1");
  const [loader, setLoader] = useState("fabric");
  const [loaderVersion, setLoaderVersion] = useState("");

  useEffect(() => {
    const update = () => setItems(readPack());
    update();
    return onPackChange(update);
  }, []);

  const href = `/api/mrpack?${new URLSearchParams({
    v: items.map((i) => i.versionId).join(","),
    name,
    mc,
    ...(loader ? { loader, loader_version: loaderVersion } : {}),
  })}`;
  const ready = items.length > 0 && (!loader || loaderVersion.trim());

  return (
    <div className="space-y-6">
      <div className="card divide-y divide-line">
        {items.map((i) => (
          <div key={i.versionId} className="flex items-center gap-3 p-4 text-sm">
            <span className="chip">{typeInfo(i.type).label}</span>
            <Link href={`/project/${i.projectSlug}`} className="flex-1 font-semibold hover:underline">{i.projectTitle}</Link>
            <span className="text-muted">{i.versionNumber}</span>
            <button onClick={() => writePack(items.filter((x) => x.versionId !== i.versionId))} className="btn-danger px-3! py-1! text-xs">Remove</button>
          </div>
        ))}
        {items.length === 0 && (
          <p className="p-8 text-center text-muted">
            Your pack is empty. <Link href="/browse?type=mod" className="text-brand underline">Browse mods</Link> and click <b>+ Pack</b> on a version.
          </p>
        )}
      </div>

      <div className="card grid gap-4 p-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="pn">Pack name</label>
          <input id="pn" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="mc">Minecraft version</label>
          <select id="mc" className="input" value={mc} onChange={(e) => setMc(e.target.value)}>
            {GAME_VERSIONS.map((v) => <option key={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="ld">Mod loader</label>
          <select id="ld" className="input" value={loader} onChange={(e) => setLoader(e.target.value)}>
            {LOADERS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </div>
        {loader && (
          <div className="sm:col-span-2">
            <label className="label" htmlFor="lv">Loader version</label>
            <input id="lv" className="input" value={loaderVersion} onChange={(e) => setLoaderVersion(e.target.value)} placeholder={LOADERS.find((l) => l.id === loader)?.hint} />
          </div>
        )}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <a href={ready ? href : undefined} aria-disabled={!ready} className={`btn-primary ${ready ? "" : "pointer-events-none opacity-50"}`}>
            Download .mrpack
          </a>
          <button onClick={() => writePack([])} className="btn-ghost" disabled={!items.length}>Clear pack</button>
        </div>
        <p className="text-xs text-muted sm:col-span-2">
          Make sure every item supports the Minecraft version and loader you pick. Data packs and plugins can&apos;t go in a launcher modpack.
        </p>
      </div>
    </div>
  );
}
