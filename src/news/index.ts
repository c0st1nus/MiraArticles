import { loadSourcesConfig } from "../config/load";
import { aggregateNews } from "./aggregator";
import { filterUnseen, loadSeenUrls } from "./dedup";
import { loadIngestState, pickBestCandidate, saveIngestState } from "./router";
import { applyStalePenalty, pickBestScored, scoreItems } from "./scoring";
import type { IngestCandidate, IngestResult, ScoredItem } from "./types";

export { canonicalUrl } from "./canonical-url";
export { markPublished, loadSeenUrls, filterUnseen } from "./dedup";
export { pickBestCandidate, loadIngestState, saveIngestState, subredditForItem } from "./router";
export { scoreItem, scoreItems, hoursSince } from "./scoring";
export type { NewsItem, ScoredItem, IngestCandidate, IngestResult } from "./types";

export async function runIngestCycle(): Promise<IngestResult> {
  const config = loadSourcesConfig();
  const seen = loadSeenUrls();
  const state = loadIngestState();

  const { items: raw, errors } = await aggregateNews(config);
  const unseen = filterUnseen(raw, seen);
  const now = new Date();
  let scored = scoreItems(unseen, now);
  scored = applyStalePenalty(scored, now);
  scored.sort((a, b) => b.score - a.score);

  const candidate = pickBestCandidate(scored, config.route_to_subreddit, state.lastSubreddit);

  if (candidate) {
    saveIngestState({ lastSubreddit: candidate.subreddit });
  }

  return {
    items: scored,
    candidate,
    fetchedCount: raw.length,
    errors,
  };
}

export function pickBestFromScored(
  items: ScoredItem[],
  lastSubreddit?: string,
): IngestCandidate | null {
  const config = loadSourcesConfig();
  return pickBestCandidate(items, config.route_to_subreddit, lastSubreddit);
}
