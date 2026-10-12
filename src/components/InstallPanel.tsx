"use client";
import { useState } from "react";
import { typeInfo } from "@/lib/constants";

interface Props {
  type: string;
  title: string;
  loaders: string[];
  directUrl: string;
  filename: string;
  /** Rendered Download button (handles "all versions" mode). */
  downloadButton: React.ReactNode;
  /** Shown above the instructions, e.g. which version this is. */
  versionNote?: string;
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
      <h3 className="mb-3 font-bold">{info.minecraft ? "Install with a launcher" : "How to use it"}</h3>
      <div className={`mb-3 flex flex-wrap gap-1.5 ${launchers.length < 2 ? "hidden" : ""}`}>
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
        <div className="flex flex-1 [&>*]:flex-1">{p.downloadButton}</div>
        <button type="button" onClick={copy} className="btn-ghost" title="Direct file URL">
          {copied ? "Copied!" : "Copy URL"}
        </button>
      </div>
      <p className="mt-2 truncate text-xs text-muted" title={p.filename}>{p.versionNote ? `${p.versionNote} · ` : ""}{p.filename}</p>
    </div>
  );
}

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-panel-2 px-1 text-text">{children}</code>
);

const list = (xs: string[]) => xs.map((x) => x.replace(/-/g, " ")).join(", ");

/** Instructions for everything that isn't Minecraft content. */
function genericSteps(p: Props): React.ReactNode[] {
  const f = <b>{p.filename}</b>;
  const zipped = /\.(zip|7z|rar)$/i.test(p.filename);
  const on = p.loaders.length ? list(p.loaders) : null;
  switch (p.type) {
    case "game":
      return [
        <>Download {f}{on && <> for {on}</>}.</>,
        zipped ? <>Extract the archive and run the game&apos;s executable.</> : <>Run the installer or open the file.</>,
        <>Check the description for controls and system requirements.</>,
      ];
    case "gamemod":
      return [
        on ? <>This mod is for <b className="capitalize">{on}</b>.</> : null,
        <>Back up your saves, then download {f}.</>,
        <>Install it with your usual mod manager (Vortex, Mod Organizer 2, r2modman…) or copy it into the game&apos;s mod folder.</>,
        <>Check the description for load order and requirements.</>,
      ].filter(Boolean);
    case "extension":
      return [
        <>Download {f}{zipped ? <> and extract it to a folder</> : null}.</>,
        <><b>Chrome / Edge / Brave:</b> open <Code>chrome://extensions</Code>, turn on Developer mode, click <b>Load unpacked</b> and pick the folder.</>,
        <><b>Firefox:</b> open <Code>about:debugging</Code> → This Firefox → <b>Load Temporary Add-on</b>, or install a signed <Code>.xpi</Code> directly.</>,
      ];
    case "script":
      return [
        <>Download {f}{on && <> ({on})</>}.</>,
        <>Read the description for dependencies and setup.</>,
        <>Only run scripts you trust. Look through the code first.</>,
      ];
    case "theme":
      return [
        <>Download {f}{on && <> for <span className="capitalize">{on}</span></>}.</>,
        <>Install it from the app&apos;s theme/appearance settings, or copy it into its themes folder.</>,
        <>See the description for app-specific steps.</>,
      ];
    case "asset":
      return [
        <>Download {f}{on && <> ({on})</>}.</>,
        <>Import it into your engine or 3D tool (e.g. drag into Blender, Unity or Godot).</>,
        <>Check the license before using it in a released project.</>,
      ];
    case "art":
      return [
        <>Download {f}.</>,
        <>Set it as your wallpaper or open it in your image editor.</>,
        <>Respect the creator&apos;s license if you share or reuse it.</>,
      ];
    case "audio":
      return [
        <>Download {f}.</>,
        <>Play it, or drop it into your DAW, video editor or game project.</>,
        <>Check the license for use in videos, streams or games.</>,
      ];
    case "font":
      return [
        <>Download {f}{zipped ? <> and extract it</> : null}.</>,
        <><b>Windows:</b> right-click the font file → <b>Install</b>. <b>macOS:</b> double-click → <b>Install Font</b>. <b>Linux:</b> copy to <Code>~/.local/share/fonts</Code>.</>,
        <>Restart apps so they see the new font.</>,
      ];
    case "template":
      return [
        <>Download {f}{on && <> for <span className="capitalize">{on}</span></>}.</>,
        <>Open or import it in that app and make a copy to edit.</>,
      ];
    default:
      return [
        <>Download {f}{on && <> ({on})</>}.</>,
        <>Follow the instructions in the description.</>,
      ];
  }
}

function buildLaunchers(p: Props, dir: string | null): Launcher[] {
  if (!typeInfo(p.type).minecraft) {
    return [{ id: "use", name: "How to use", steps: genericSteps(p) }];
  }

  if (typeInfo(p.type).edition === "bedrock") {
    const f = <b>{p.filename}</b>;
    const what = p.type === "bedrock_world" ? "world" : p.type === "bedrock_template" ? "world template" : "pack";
    return [
      { id: "jace", name: "Jace Launcher", steps: [
        <>Open <b>Bedrock</b> in Jace Launcher (Linux and macOS, through the Minecraft Bedrock Launcher).</>,
        <>Find it on the <b>Jace Store</b> tab and click <b>Install</b>, or click <b>Import file</b> and pick {f}.</>,
        p.type === "bedrock_addon" || p.type === "bedrock_texture"
          ? <>In Minecraft, turn it on in the world&apos;s <b>Behavior Packs</b> / <b>Resource Packs</b> settings.</>
          : <>Start Minecraft. The {what} is in your list.</>,
      ]},
      { id: "windows", name: "Windows", steps: [
        <>Download {f}.</>,
        <>Double-click it. Minecraft opens and imports the {what}.</>,
      ]},
      { id: "mobile", name: "Phone / tablet", steps: [
        <>Download {f} on the device.</>,
        <>Open it and choose <b>Minecraft</b>. It imports automatically.</>,
      ]},
      { id: "console", name: "Console", steps: [
        <>Consoles can&apos;t import files. Use the Marketplace, or a Realm you set up from another device.</>,
      ]},
    ];
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
