import { readFileSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";

const projectRoot = join(import.meta.dir, "../..");

export type TierName = "fast" | "security" | "quality" | "vendor";

export type SourceType = "rss" | "json" | "manual_or_api";

export interface SourceEntry {
  id: string;
  url: string;
  lang?: string;
  tags: string[];
  type?: SourceType;
  note?: string;
}

export interface SourcesConfig {
  tiers: Record<TierName, SourceEntry[]>;
  route_to_subreddit: Record<string, string>;
}

export interface SubredditEntry {
  name: string;
  url: string;
  themes: string[];
}

export interface SubredditsConfig {
  subreddits: SubredditEntry[];
  risk_promo: Record<string, string[]>;
  rollout_order: string[];
}

function readYamlFile<T>(relativePath: string): T {
  const path = join(projectRoot, relativePath);
  const raw = readFileSync(path, "utf8");
  return parseYaml(raw) as T;
}

export function loadSourcesConfig(
  path = process.env.SOURCES_CONFIG ?? "config/sources.yaml",
): SourcesConfig {
  const data = readYamlFile<SourcesConfig>(path);
  for (const tier of Object.keys(data.tiers) as TierName[]) {
    data.tiers[tier] ??= [];
  }
  return data;
}

export function loadSubredditsConfig(
  path = process.env.SUBREDDITS_CONFIG ?? "config/subreddits.yaml",
): SubredditsConfig {
  return readYamlFile<SubredditsConfig>(path);
}

/** Flatten all tier sources with tier label attached. */
export function listEnabledSources(config: SourcesConfig): Array<SourceEntry & { tier: TierName }> {
  const out: Array<SourceEntry & { tier: TierName }> = [];
  for (const tier of ["fast", "security", "quality", "vendor"] as TierName[]) {
    for (const entry of config.tiers[tier] ?? []) {
      out.push({ ...entry, tier });
    }
  }
  return out;
}

export function projectDataDir(): string {
  return process.env.INGEST_DATA_DIR ?? join(projectRoot, "data");
}
