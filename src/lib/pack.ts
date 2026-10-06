"use client";

// The pack builder stores selected version ids in localStorage.
export interface PackItem {
  versionId: string;
  projectTitle: string;
  projectSlug: string;
  versionNumber: string;
  type: string;
}

const KEY = "jace-store-pack";
const EVENT = "jace-pack-change";

export function readPack(): PackItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function writePack(items: PackItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function onPackChange(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
