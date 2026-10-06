export type ProjectType =
  | "mod"
  | "resourcepack"
  | "shader"
  | "datapack"
  | "modpack"
  | "plugin"
  | "world"
  | "app";

export const PROJECT_TYPES: {
  id: ProjectType;
  label: string;
  plural: string;
  /** Folder inside the Minecraft instance where files of this type go. */
  installDir: string | null;
  accept: string;
  loaders: string[];
  categories: string[];
}[] = [
  {
    id: "mod",
    label: "Mod",
    plural: "Mods",
    installDir: "mods",
    accept: ".jar",
    loaders: ["fabric", "forge", "neoforge", "quilt", "liteloader"],
    categories: ["adventure", "decoration", "equipment", "food", "library", "magic", "mobs", "optimization", "storage", "technology", "transportation", "utility", "worldgen"],
  },
  {
    id: "resourcepack",
    label: "Resource Pack",
    plural: "Resource Packs",
    installDir: "resourcepacks",
    accept: ".zip",
    loaders: ["minecraft"],
    categories: ["16x", "32x", "64x", "128x+", "realistic", "simplistic", "themed", "vanilla-like", "gui", "audio", "fonts", "models"],
  },
  {
    id: "shader",
    label: "Shader",
    plural: "Shaders",
    installDir: "shaderpacks",
    accept: ".zip",
    loaders: ["iris", "optifine", "canvas", "vanilla"],
    categories: ["realistic", "fantasy", "semi-realistic", "cartoon", "potato", "low", "medium", "high", "screenshot"],
  },
  {
    id: "datapack",
    label: "Data Pack",
    plural: "Data Packs",
    installDir: "saves/<world>/datapacks",
    accept: ".zip",
    loaders: ["datapack"],
    categories: ["adventure", "equipment", "game-mechanics", "magic", "mobs", "utility", "worldgen"],
  },
  {
    id: "modpack",
    label: "Modpack",
    plural: "Modpacks",
    installDir: null,
    accept: ".mrpack,.zip",
    loaders: ["fabric", "forge", "neoforge", "quilt"],
    categories: ["adventure", "challenging", "combat", "kitchen-sink", "lightweight", "magic", "multiplayer", "optimization", "quests", "technology"],
  },
  {
    id: "plugin",
    label: "Plugin",
    plural: "Plugins",
    installDir: "plugins",
    accept: ".jar",
    loaders: ["paper", "spigot", "bukkit", "purpur", "folia", "velocity", "bungeecord", "waterfall"],
    categories: ["admin-tools", "chat", "economy", "game-mechanics", "minigame", "protection", "utility", "world-management"],
  },
  {
    id: "world",
    label: "World",
    plural: "Worlds",
    installDir: "saves",
    accept: ".zip",
    loaders: ["minecraft"],
    categories: ["adventure", "creation", "minigame", "parkour", "puzzle", "survival", "showcase"],
  },
  {
    id: "app",
    label: "App",
    plural: "Apps",
    installDir: null,
    accept: "*",
    loaders: ["windows", "macos", "linux", "android", "ios", "web", "cross-platform"],
    categories: ["launcher", "server-tool", "map-viewer", "editor", "utility", "bot", "other"],
  },
];

export const typeInfo = (t: string) =>
  PROJECT_TYPES.find((p) => p.id === t) ?? PROJECT_TYPES[0];

export const GAME_VERSIONS = [
  "1.21.10", "1.21.9", "1.21.8", "1.21.7", "1.21.6", "1.21.5", "1.21.4", "1.21.3", "1.21.2", "1.21.1", "1.21",
  "1.20.6", "1.20.5", "1.20.4", "1.20.3", "1.20.2", "1.20.1", "1.20",
  "1.19.4", "1.19.3", "1.19.2", "1.19.1", "1.19",
  "1.18.2", "1.18.1", "1.18",
  "1.17.1", "1.17", "1.16.5", "1.16.4", "1.16.1", "1.15.2", "1.14.4", "1.13.2", "1.12.2", "1.11.2", "1.10.2", "1.9.4", "1.8.9", "1.7.10",
];

export const SORTS = [
  { id: "downloads", label: "Downloads" },
  { id: "updated", label: "Recently updated" },
  { id: "newest", label: "Newest" },
] as const;

export const SITE_NAME = "Jace Store";

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
