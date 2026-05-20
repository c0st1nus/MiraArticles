import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { SourcesConfig } from "../config/load";
import { projectDataDir } from "../config/load";
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
      return sub;
    }
  }

  if (!allowProgramming && skippedProgramming) {
    return routeMap.technology ?? "technology";
  }

  return routeMap.default ?? "linux";
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

export function pickBestCandidate(
  items: ScoredItem[],
  routeMap: SourcesConfig["route_to_subreddit"],
  lastSubreddit?: string,
): IngestCandidate | null {
  if (items.length === 0) return null;

  const maxScore = Math.max(...items.map((i) => i.score));
  const top = items.filter((i) => i.score === maxScore);
  const { item, subreddit } = pickSubredditForCandidates(top, routeMap, lastSubreddit);
  return { ...item, subreddit };
}
