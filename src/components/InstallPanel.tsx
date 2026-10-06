"use client";
import { useState } from "react";
import { typeInfo } from "@/lib/constants";

interface Props {
  type: string;
  title: string;
  loaders: string[];
  downloadUrl: string;
  directUrl: string;
  filename: string;
}

type Launcher = { id: string; name: string; steps: React.ReactNode[] };

export default function InstallPanel(p: Props) {
  const info = typeInfo(p.type);
  const launchers = buildLaunchers(p, info.installDir);
  const [active, setActive] = useState(launchers[0]?.id);
  const [copied, setCopied] = useState(false);
  const current = launchers.find((l) => l.id === active) ?? launchers[0];

  async function copy() {
    await navigator.clipboard.writeText(p.directUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="card p-4">
      <h3 className="mb-3 font-bold">Install with a launcher</h3>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {launchers.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setActive(l.id)}
            className={`chip cursor-pointer ${l.id === current?.id ? "chip-on" : "hover:text-text"}`}
          >
            {l.name}
          </button>
        ))}
      </div>
      {current && (
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
          {current.steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      )}
      <div className="mt-4 flex gap-2">
        <a href={p.downloadUrl} className="btn-primary flex-1">Download</a>
        <button type="button" onClick={copy} className="btn-ghost" title="Direct file URL for launcher import">
          {copied ? "Copied!" : "Copy URL"}
        </button>
      </div>
      <p className="mt-2 truncate text-xs text-muted" title={p.filename}>{p.filename}</p>
    </div>
  );
}

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-panel-2 px-1 text-text">{children}</code>
);

function buildLaunchers(p: Props, dir: string | null): Launcher[] {
  if (p.type === "app") {
    return [{
      id: "app",
      name: "Install",
      steps: [
        <>Download <b>{p.filename}</b>.</>,
        <>Supported platforms: {p.loaders.join(", ") || "see description"}.</>,
        <>Follow the setup instructions in the project description.</>,
      ],
    }];
  }

  if (p.type === "modpack") {
    const mr = p.filename.endsWith(".mrpack");
    return [
      { id: "prism", name: "Prism / MultiMC", steps: [
        <>Click <b>Add Instance</b> → <b>Import</b>.</>,
        <>Paste the file URL (use <b>Copy URL</b> below) or pick the downloaded file.</>,
        <>Click OK, then launch the new instance.</>,
      ]},
      { id: "atl", name: "ATLauncher", steps: [
        <>Open the <b>Import</b> tab.</>,
        <>Choose the downloaded <Code>{mr ? ".mrpack" : ".zip"}</Code> file (or paste the URL).</>,
        <>Click <b>Import</b>; the instance appears under <b>Instances</b>.</>,
      ]},
      { id: "modrinth", name: "Modrinth App", steps: mr ? [
        <>Download the <Code>.mrpack</Code> file.</>,
        <>Click <b>+</b> (Create instance) → <b>Import</b> / <b>From file</b>, and select it.</>,
      ] : [
        <>The Modrinth App imports <Code>.mrpack</Code> files. This pack is a <Code>.zip</Code>; use Prism or ATLauncher instead.</>,
      ]},
      { id: "official", name: "Official launcher", steps: [
        <>The official launcher can&apos;t import modpacks directly.</>,
        <>Use Prism Launcher (free, open source) or follow the pack&apos;s own instructions.</>,
      ]},
    ];
  }

  const folder = dir ?? "";
  const needsLoader = p.type === "mod" || (p.type === "shader" && p.loaders.some((l) => l === "iris" || l === "optifine"));
  const loaderNote = needsLoader && p.loaders.length > 0 && (
    <>Make sure the instance uses {p.loaders.map((l, i) => <span key={l}>{i > 0 && " / "}<b className="capitalize">{l}</b></span>)}.</>
  );
  const prismTab = p.type === "mod" ? "Mods" : p.type === "resourcepack" ? "Resource packs" : p.type === "shader" ? "Shader packs" : p.type === "world" ? "Worlds" : null;

  if (p.type === "plugin") {
    return [{ id: "server", name: "Server", steps: [
      <>Stop your server.</>,
      <>Put <b>{p.filename}</b> in the server&apos;s <Code>plugins/</Code> folder.</>,
      <>Start the server. Requires {p.loaders.join(" / ") || "a plugin-capable server"}.</>,
    ]}];
  }

  return [
    { id: "prism", name: "Prism / MultiMC", steps: [
      loaderNote,
      prismTab
        ? <>Right-click the instance → <b>Edit</b> → <b>{prismTab}</b>.</>
        : <>Right-click the instance → <b>Folder</b>, and open <Code>{folder}/</Code>.</>,
      prismTab ? <>Drag the downloaded file in, or click <b>Add file</b>.</> : <>Copy the file into that folder.</>,
    ].filter(Boolean) },
    { id: "modrinth", name: "Modrinth App", steps: [
      loaderNote,
      <>Open the instance and drag the downloaded file onto its <b>Content</b> page.</>,
      <>Or use <b>⋯ → Open folder</b> and copy it into <Code>{folder}/</Code>.</>,
    ].filter(Boolean) },
    { id: "atl", name: "ATLauncher", steps: [
      loaderNote,
      <>On the instance, click <b>Edit Mods</b> → <b>Add</b> (for mods) or <b>Open Folder</b>.</>,
      <>Place the file in <Code>{folder}/</Code>.</>,
    ].filter(Boolean) },
    { id: "curseforge", name: "CurseForge App", steps: [
      loaderNote,
      <>Open the profile → <b>⋯</b> → <b>Open Folder</b>.</>,
      <>Copy the file into <Code>{folder}/</Code>.</>,
    ].filter(Boolean) },
    { id: "official", name: "Official launcher", steps: [
      p.type === "mod" ? <>Install the {p.loaders[0] ?? "mod loader"} installer and select its profile.</> : null,
      p.type === "shader" && p.loaders.includes("iris") ? <>Install Iris (via Fabric) first.</> : null,
      <>Open <Code>.minecraft/{folder}/</Code> (Windows: <Code>%appdata%\.minecraft</Code>, macOS: <Code>~/Library/Application Support/minecraft</Code>).</>,
      <>Copy the file there and restart the game.</>,
    ].filter(Boolean) },
  ] as Launcher[];
}
