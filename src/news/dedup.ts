import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { projectDataDir } from "../config/load";
import { canonicalUrl } from "./canonical-url";

const SEEN_TTL_MS = 72 * 60 * 60 * 1000;

export interface SeenEntry {
  url: string;
  seenAt: string;
}

export interface SeenUrlsFile {
  entries: SeenEntry[];
}

function seenUrlsPath(): string {
  return join(projectDataDir(), "seen-urls.json");
}

function loadRaw(): SeenUrlsFile {
  const path = seenUrlsPath();
  if (!existsSync(path)) {
    return { entries: [] };
  }
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as SeenUrlsFile;
    return { entries: Array.isArray(data.entries) ? data.entries : [] };
  } catch {
    return { entries: [] };
  }
}

export function pruneSeenEntries(entries: SeenEntry[], now = Date.now()): SeenEntry[] {
  const cutoff = now - SEEN_TTL_MS;
  return entries.filter((e) => {
    const t = new Date(e.seenAt).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
}

export function loadSeenUrls(now = Date.now()): Set<string> {
  const pruned = pruneSeenEntries(loadRaw().entries, now);
  return new Set(pruned.map((e) => e.url));
}

function ensureDataDir(): void {
  const dir = projectDataDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function saveSeenUrls(entries: SeenEntry[]): void {
  ensureDataDir();
  const pruned = pruneSeenEntries(entries);
  writeFileSync(seenUrlsPath(), `${JSON.stringify({ entries: pruned }, null, 2)}\n`, "utf8");
}

export function filterUnseen<T extends { url: string }>(
  items: T[],
  seen: Set<string>,
): T[] {
  return items.filter((item) => !seen.has(canonicalUrl(item.url)));
}

export function markPublished(rawUrl: string, now = new Date()): void {
  const url = canonicalUrl(rawUrl);
  const file = loadRaw();
  const entries = pruneSeenEntries(file.entries, now.getTime());
  const without = entries.filter((e) => e.url !== url);
  without.push({ url, seenAt: now.toISOString() });
  saveSeenUrls(without);
}
