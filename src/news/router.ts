import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { SourcesConfig } from "../config/load";
import { projectDataDir } from "../config/load";
import {
  getAllowedSubreddits,
  isSubredditBlocked,
} from "../publishers/reddit-policy";
import type { ScoredItem, IngestCandidate } from "./types";

export interface IngestState {
  lastSubreddit?: string;
}

function ingestStatePath(): string {
  return join(projectDataDir(), "ingest-state.json");
}

export function loadIngestState(): IngestState {
  const path = ingestStatePath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as IngestState;
  } catch {
    return {};
  }
}

export function saveIngestState(state: IngestState): void {
  const dir = projectDataDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(ingestStatePath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function isProgrammingAllowed(): boolean {
  return process.env.ALLOW_R_PROGRAMMING === "true";
}

function isRoutableSubreddit(sub: string): boolean {
  return !isSubredditBlocked(sub);
}

/** First tag→sub match ignoring blocked list (for ingest eligibility). */
export function directSubredditForTags(
  tags: string[],
  routeMap: SourcesConfig["route_to_subreddit"],
): string {
  const allowProgramming = isProgrammingAllowed();

  for (const tag of tags) {
    if (!allowProgramming && tag === "programming") continue;
    const sub = routeMap[tag];
    if (sub) {
      if (!allowProgramming && sub === "programming") continue;
      return sub;
    }
  }

  return routeMap.default ?? "linux";
}

export function directSubredditForItem(
  item: ScoredItem,
  routeMap: SourcesConfig["route_to_subreddit"],
): string {
  return directSubredditForTags(item.tags, routeMap);
}

function programmingFallback(routeMap: SourcesConfig["route_to_subreddit"]): string {
  const tech = routeMap.technology ?? "technology";
  if (isRoutableSubreddit(tech)) return tech;
  return routeMap.default ?? "linux";
}

/** Map source tags to a subreddit name (without r/). */
export function resolveSubredditForTags(
  tags: string[],
  routeMap: SourcesConfig["route_to_subreddit"],
): string {
  const allowProgramming = isProgrammingAllowed();
  let skippedProgramming = false;

  for (const tag of tags) {
    if (!allowProgramming && tag === "programming") {
      skippedProgramming = true;
      continue;
    }
    const sub = routeMap[tag];
    if (sub) {
      if (!allowProgramming && sub === "programming") {
        skippedProgramming = true;
        continue;
      }
      if (isRoutableSubreddit(sub)) {
        return sub;
      }
      continue;
    }
  }

  if (!allowProgramming && skippedProgramming) {
    return programmingFallback(routeMap);
  }

  const fallback = routeMap.default ?? "linux";
  return isRoutableSubreddit(fallback) ? fallback : fallback;
}

export function subredditForItem(
  item: ScoredItem,
  routeMap: SourcesConfig["route_to_subreddit"],
): string {
  return resolveSubredditForTags(item.tags, routeMap);
}

const ROTATION_ORDER = [
  "selfhosted",
  "linux",
  "opensource",
  "devops",
  "sysadmin",
  "netsec",
  "technology",
];

function nextInRotation(last: string | undefined, candidates: string[]): string {
  const unique = [...new Set(candidates)];
  if (unique.length === 0) return "linux";
  if (unique.length === 1) return unique[0]!;

  const ordered = ROTATION_ORDER.filter((s) => unique.includes(s));
  const pool = ordered.length > 0 ? ordered : unique.sort();

  if (!last) return pool[0]!;

  const idx = pool.indexOf(last);
  if (idx === -1) return pool[0]!;
  return pool[(idx + 1) % pool.length]!;
}

/** Among equal top scores, pick subreddit with rotation when subs differ. */
export function pickSubredditForCandidates(
  topItems: ScoredItem[],
  routeMap: SourcesConfig["route_to_subreddit"],
  lastSubreddit?: string,
): { item: ScoredItem; subreddit: string } {
  const subs = topItems.map((i) => subredditForItem(i, routeMap));
  const uniqueSubs = [...new Set(subs)];

  if (uniqueSubs.length === 1) {
    return { item: topItems[0]!, subreddit: uniqueSubs[0]! };
  }

  const chosenSub = nextInRotation(lastSubreddit, uniqueSubs);
  const idx = subs.indexOf(chosenSub);
  const item = topItems[idx >= 0 ? idx : 0]!;
  return { item, subreddit: chosenSub };
}

export function routeCandidate(
  item: ScoredItem,
  routeMap: SourcesConfig["route_to_subreddit"],
): IngestCandidate {
  return {
    ...item,
    subreddit: subredditForItem(item, routeMap),
  };
}

function filterEligibleCandidates(
  items: ScoredItem[],
  routeMap: SourcesConfig["route_to_subreddit"],
): ScoredItem[] {
  let eligible = items.filter((i) => !isSubredditBlocked(directSubredditForItem(i, routeMap)));

  const allowed = getAllowedSubreddits();
  if (allowed && allowed.length > 0) {
    const allowedSet = new Set(allowed);
    const inAllowlist = eligible.filter((i) =>
      allowedSet.has(directSubredditForItem(i, routeMap)),
    );
    if (inAllowlist.length > 0) {
      eligible = inAllowlist;
    }
  }

  return eligible;
}

export function pickBestCandidate(
  items: ScoredItem[],
  routeMap: SourcesConfig["route_to_subreddit"],
  lastSubreddit?: string,
): IngestCandidate | null {
  if (items.length === 0) return null;

  const scores = [...new Set(items.map((i) => i.score))].sort((a, b) => b - a);

  for (const score of scores) {
    const tier = items.filter((i) => i.score === score);
    const eligible = filterEligibleCandidates(tier, routeMap);
    if (eligible.length === 0) continue;

    const { item, subreddit } = pickSubredditForCandidates(
      eligible,
      routeMap,
      lastSubreddit,
    );
    return { ...item, subreddit };
  }

  return null;
}
