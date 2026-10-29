export type ProjectType =
  | "mod" | "resourcepack" | "shader" | "datapack" | "modpack" | "plugin" | "world"
  | "bedrock_addon" | "bedrock_texture" | "bedrock_world" | "bedrock_skin" | "bedrock_template"
  | "game" | "gamemod"
  | "app" | "extension" | "script" | "theme"
  | "asset" | "art" | "audio" | "font" | "template"
  | "other";

export type GroupId = "minecraft" | "bedrock" | "games" | "software" | "creative" | "other";

export const GROUPS: { id: GroupId; label: string; blurb: string }[] = [
  { id: "minecraft", label: "Minecraft", blurb: "Mods, packs, shaders and worlds, with launcher support" },
  { id: "bedrock", label: "Minecraft Bedrock", blurb: "Add-ons, texture packs, worlds and skins for Bedrock Edition" },
  { id: "games", label: "Games", blurb: "Indie games and mods for your favourite titles" },
  { id: "software", label: "Software", blurb: "Apps, browser extensions, scripts and themes" },
  { id: "creative", label: "Creative", blurb: "3D assets, art, music, fonts and templates" },
  { id: "other", label: "Other", blurb: "Anything that doesn't fit anywhere else" },
];

export interface TypeInfo {
  id: ProjectType;
  group: GroupId;
  label: string;
  plural: string;
  icon: string;
  /** Minecraft content: uses game versions, launcher instructions, pack builder. */
  minecraft: boolean;
  /** Which Minecraft: "java" (default for Minecraft types) or "bedrock" (imported, not copied). */
  edition?: "java" | "bedrock";
  /** What the "loaders" field means for this type (Loader, Platform, Game, Browser…). */
  loaderLabel: string;
  /** Folder inside the Minecraft instance where files of this type go. */
  installDir: string | null;
  /** <input accept>; "*" means any file. */
  accept: string;
  loaders: string[];
  categories: string[];
}

export const PROJECT_TYPES: TypeInfo[] = [
  // ---- Minecraft ----------------------------------------------------------
  {
    id: "mod", group: "minecraft", label: "Mod", plural: "Mods", icon: "🧩", minecraft: true,
    loaderLabel: "Loader", installDir: "mods", accept: ".jar",
    loaders: ["fabric", "forge", "neoforge", "quilt", "liteloader"],
    categories: ["adventure", "decoration", "equipment", "food", "library", "magic", "mobs", "optimization", "storage", "technology", "transportation", "utility", "worldgen"],
  },
  {
    id: "resourcepack", group: "minecraft", label: "Resource Pack", plural: "Resource Packs", icon: "🎨", minecraft: true,
    loaderLabel: "Loader", installDir: "resourcepacks", accept: ".zip",
    loaders: ["minecraft"],
    categories: ["16x", "32x", "64x", "128x+", "realistic", "simplistic", "themed", "vanilla-like", "gui", "audio", "fonts", "models"],
  },
  {
    id: "shader", group: "minecraft", label: "Shader", plural: "Shaders", icon: "✨", minecraft: true,
    loaderLabel: "Loader", installDir: "shaderpacks", accept: ".zip",
    loaders: ["iris", "optifine", "canvas", "vanilla"],
    categories: ["realistic", "fantasy", "semi-realistic", "cartoon", "potato", "low", "medium", "high", "screenshot"],
  },
  {
    id: "datapack", group: "minecraft", label: "Data Pack", plural: "Data Packs", icon: "📦", minecraft: true,
    loaderLabel: "Loader", installDir: "saves/<world>/datapacks", accept: ".zip",
    loaders: ["datapack"],
    categories: ["adventure", "equipment", "game-mechanics", "magic", "mobs", "utility", "worldgen"],
  },
  {
    id: "modpack", group: "minecraft", label: "Modpack", plural: "Modpacks", icon: "🗃️", minecraft: true,
    loaderLabel: "Loader", installDir: null, accept: ".mrpack,.zip",
    loaders: ["fabric", "forge", "neoforge", "quilt"],
    categories: ["adventure", "challenging", "combat", "kitchen-sink", "lightweight", "magic", "multiplayer", "optimization", "quests", "technology"],
  },
  {
    id: "plugin", group: "minecraft", label: "Server Plugin", plural: "Server Plugins", icon: "🔌", minecraft: true,
    loaderLabel: "Server", installDir: "plugins", accept: ".jar",
    loaders: ["paper", "spigot", "bukkit", "purpur", "folia", "velocity", "bungeecord", "waterfall"],
    categories: ["admin-tools", "chat", "economy", "game-mechanics", "minigame", "protection", "utility", "world-management"],
  },
  {
    id: "world", group: "minecraft", label: "World", plural: "Worlds", icon: "🌍", minecraft: true,
    loaderLabel: "Edition", installDir: "saves", accept: ".zip,.mcworld",
    loaders: ["java", "bedrock"],
    categories: ["adventure", "creation", "minigame", "parkour", "puzzle", "survival", "showcase"],
  },
  // ---- Minecraft Bedrock ---------------------------------------------------
  // Files Bedrock imports itself (.mcpack, .mcaddon, .mcworld, .mctemplate): launchers
  // import them into the game's com.mojang folder instead of copying to a fixed folder.
  {
    id: "bedrock_addon", group: "bedrock", edition: "bedrock", label: "Add-On", plural: "Add-Ons", icon: "🧱", minecraft: true,
    loaderLabel: "Contains", installDir: null, accept: ".mcaddon,.mcpack,.zip",
    loaders: ["behavior-pack", "resource-pack", "scripts"],
    categories: ["adventure", "blocks", "decoration", "equipment", "food", "furniture", "magic", "mobs", "technology", "utility", "vehicles", "worldgen"],
  },
  {
    id: "bedrock_texture", group: "bedrock", edition: "bedrock", label: "Texture Pack", plural: "Texture Packs", icon: "🎨", minecraft: true,
    loaderLabel: "Style", installDir: null, accept: ".mcpack,.zip",
    loaders: ["vanilla", "raytracing", "pbr", "vibrant-visuals"],
    categories: ["16x", "32x", "64x", "128x+", "realistic", "simplistic", "themed", "vanilla-like", "gui", "audio", "fonts"],
  },
  {
    id: "bedrock_world", group: "bedrock", edition: "bedrock", label: "World", plural: "Worlds", icon: "🌍", minecraft: true,
    loaderLabel: "Mode", installDir: null, accept: ".mcworld,.zip",
    loaders: ["survival", "creative", "adventure"],
    categories: ["adventure", "creation", "minigame", "parkour", "puzzle", "survival", "showcase", "pvp"],
  },
  {
    id: "bedrock_skin", group: "bedrock", edition: "bedrock", label: "Skin Pack", plural: "Skin Packs", icon: "🧍", minecraft: true,
    loaderLabel: "Model", installDir: null, accept: ".mcpack,.zip",
    loaders: ["classic", "slim", "mixed"],
    categories: ["animals", "anime", "fantasy", "gaming", "holiday", "people", "sci-fi", "funny"],
  },
  {
    id: "bedrock_template", group: "bedrock", edition: "bedrock", label: "World Template", plural: "World Templates", icon: "🗺️", minecraft: true,
    loaderLabel: "Mode", installDir: null, accept: ".mctemplate,.zip",
    loaders: ["survival", "creative", "adventure"],
    categories: ["adventure", "creation", "minigame", "parkour", "puzzle", "survival", "showcase"],
  },
  // ---- Games --------------------------------------------------------------
  {
    id: "game", group: "games", label: "Game", plural: "Games", icon: "🎮", minecraft: false,
    loaderLabel: "Platform", installDir: null, accept: "*",
    loaders: ["windows", "macos", "linux", "android", "ios", "web", "steam-deck"],
    categories: ["action", "adventure", "arcade", "horror", "multiplayer", "platformer", "puzzle", "racing", "rpg", "sandbox", "shooter", "simulation", "strategy", "visual-novel"],
  },
  {
    id: "gamemod", group: "games", label: "Game Mod", plural: "Game Mods", icon: "🛠️", minecraft: false,
    loaderLabel: "Game", installDir: null, accept: "*",
    loaders: ["skyrim", "fallout-4", "stardew-valley", "terraria", "gta-v", "cyberpunk-2077", "baldurs-gate-3", "the-sims-4", "elden-ring", "rimworld", "factorio", "valheim", "minecraft-bedrock", "other-game"],
    categories: ["gameplay", "graphics", "ui", "characters", "items", "maps", "quests", "audio", "performance", "cheats", "overhaul", "utility"],
  },
  // ---- Software -----------------------------------------------------------
  {
    id: "app", group: "software", label: "App", plural: "Apps", icon: "💻", minecraft: false,
    loaderLabel: "Platform", installDir: null, accept: "*",
    loaders: ["windows", "macos", "linux", "android", "ios", "web", "cross-platform"],
    categories: ["productivity", "developer-tools", "media", "communication", "education", "gaming", "launcher", "server-tool", "security", "utility", "other"],
  },
  {
    id: "extension", group: "software", label: "Browser Extension", plural: "Extensions", icon: "🧭", minecraft: false,
    loaderLabel: "Browser", installDir: null, accept: ".zip,.crx,.xpi",
    loaders: ["chrome", "firefox", "edge", "safari", "opera", "brave"],
    categories: ["productivity", "privacy", "accessibility", "developer-tools", "shopping", "social", "appearance", "utility"],
  },
  {
    id: "script", group: "software", label: "Script / Bot", plural: "Scripts & Bots", icon: "📜", minecraft: false,
    loaderLabel: "Language", installDir: null, accept: "*",
    loaders: ["python", "javascript", "typescript", "lua", "bash", "powershell", "autohotkey", "csharp", "java", "other-language"],
    categories: ["automation", "discord-bot", "userscript", "cli", "data", "game-script", "web-scraping", "utility"],
  },
  {
    id: "theme", group: "software", label: "Theme", plural: "Themes", icon: "🖌️", minecraft: false,
    loaderLabel: "For", installDir: null, accept: "*",
    loaders: ["windows", "macos", "linux", "vscode", "discord", "obsidian", "firefox", "android", "other-app"],
    categories: ["dark", "light", "minimal", "colorful", "retro", "icons", "cursors", "fonts"],
  },
  // ---- Creative -----------------------------------------------------------
  {
    id: "asset", group: "creative", label: "3D / Game Asset", plural: "3D & Game Assets", icon: "🧊", minecraft: false,
    loaderLabel: "Engine / format", installDir: null, accept: "*",
    loaders: ["blender", "unity", "unreal", "godot", "gamemaker", "roblox-studio", "gltf", "fbx", "obj", "sprites"],
    categories: ["characters", "environments", "props", "vehicles", "weapons", "textures", "animations", "vfx", "ui", "low-poly", "pixel-art"],
  },
  {
    id: "art", group: "creative", label: "Art & Wallpaper", plural: "Art & Wallpapers", icon: "🖼️", minecraft: false,
    loaderLabel: "Format", installDir: null, accept: "image/*,video/*,.zip,.psd,.kra,.svg",
    loaders: ["desktop", "mobile", "4k", "animated", "png", "svg", "psd"],
    categories: ["abstract", "anime", "fantasy", "gaming", "landscape", "minimal", "pixel-art", "sci-fi", "photography", "icons"],
  },
  {
    id: "audio", group: "creative", label: "Music & Sound", plural: "Music & Sounds", icon: "🎵", minecraft: false,
    loaderLabel: "Format", installDir: null, accept: "audio/*,.zip,.mid,.midi",
    loaders: ["mp3", "wav", "ogg", "flac", "midi", "sample-pack"],
    categories: ["music", "sound-effects", "loops", "ambient", "game-audio", "voice", "lofi", "electronic", "orchestral"],
  },
  {
    id: "font", group: "creative", label: "Font", plural: "Fonts", icon: "🔤", minecraft: false,
    loaderLabel: "Format", installDir: null, accept: ".ttf,.otf,.woff,.woff2,.zip",
    loaders: ["ttf", "otf", "woff2", "variable"],
    categories: ["sans-serif", "serif", "display", "handwritten", "monospace", "pixel", "decorative"],
  },
  {
    id: "template", group: "creative", label: "Template", plural: "Templates", icon: "📐", minecraft: false,
    loaderLabel: "For", installDir: null, accept: "*",
    loaders: ["figma", "notion", "canva", "word", "excel", "powerpoint", "google-docs", "html", "react", "obs"],
    categories: ["website", "resume", "presentation", "planner", "social-media", "stream-overlay", "ui-kit", "document"],
  },
  // ---- Other --------------------------------------------------------------
  {
    id: "other", group: "other", label: "Other", plural: "Other", icon: "📁", minecraft: false,
    loaderLabel: "Platform", installDir: null, accept: "*",
    loaders: ["windows", "macos", "linux", "android", "ios", "web", "any"],
    categories: ["documents", "datasets", "guides", "misc"],
  },
];

export const typesInGroup = (g: string) => PROJECT_TYPES.filter((t) => t.group === g);
export const groupInfo = (g: string) => GROUPS.find((x) => x.id === g);

export const typeInfo = (t: string) =>
  PROJECT_TYPES.find((p) => p.id === t) ?? PROJECT_TYPES[0];

export const GAME_VERSIONS = [
  "1.21.10", "1.21.9", "1.21.8", "1.21.7", "1.21.6", "1.21.5", "1.21.4", "1.21.3", "1.21.2", "1.21.1", "1.21",
  "1.20.6", "1.20.5", "1.20.4", "1.20.3", "1.20.2", "1.20.1", "1.20",
  "1.19.4", "1.19.3", "1.19.2", "1.19.1", "1.19",
  "1.18.2", "1.18.1", "1.18",
  "1.17.1", "1.17", "1.16.5", "1.16.4", "1.16.1", "1.15.2", "1.14.4", "1.13.2", "1.12.2", "1.11.2", "1.10.2", "1.9.4", "1.8.9", "1.7.10",
];

/** Bedrock release lines (feature updates). Bedrock numbers releases 1.21.x, then 1.26.x. */
export const BEDROCK_VERSIONS = [
  "1.26.50", "1.26.40", "1.26.30", "1.26.20", "1.26.10", "1.26.0",
  "1.21.130", "1.21.120", "1.21.110", "1.21.100", "1.21.90", "1.21.80", "1.21.70", "1.21.60", "1.21.50", "1.21.40", "1.21.30", "1.21.20", "1.21.0",
  "1.20.80", "1.20.70", "1.20.60", "1.20.50", "1.20.40", "1.20.30", "1.20.10", "1.20.0",
];

/** The version list that fits a project type (Java or Bedrock). */
export const versionsFor = (t: string) => (typeInfo(t).edition === "bedrock" ? BEDROCK_VERSIONS : GAME_VERSIONS);
export const isBedrock = (t: string) => typeInfo(t).edition === "bedrock";

export const SORTS = [
  { id: "downloads", label: "Downloads" },
  { id: "likes", label: "Most liked" },
  { id: "updated", label: "Recently updated" },
  { id: "newest", label: "Newest" },
] as const;

export const SITE_NAME = "Jace Store";
export const TAGLINE = "The hub for everything you make";

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  ).replace(/\/$/, "");
}

export function formatNumber(n: number) {
  return Intl.NumberFormat("en", { notation: "compact" }).format(n);
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  const steps: [number, string][] = [
    [60, "second"], [60, "minute"], [24, "hour"], [30, "day"], [12, "month"], [Infinity, "year"],
  ];
  let v = s;
  for (const [div, unit] of steps) {
    if (v < div) {
      const r = Math.max(1, Math.floor(v));
      return `${r} ${unit}${r === 1 ? "" : "s"} ago`;
    }
    v /= div;
  }
  return "";
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
