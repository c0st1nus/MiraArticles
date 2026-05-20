import type { SourceEntry, SourcesConfig, TierName } from "../config/load";
import { listEnabledSources } from "../config/load";
import { fetchJsonFeed } from "./fetch-json";
import { fetchRssFeed } from "./fetch-rss";
import type { NewsItem } from "./types";

function isSkippedSource(entry: SourceEntry): boolean {
  return entry.type === "manual_or_api";
}

export async function fetchSource(
  entry: SourceEntry & { tier: TierName },
): Promise<NewsItem[]> {
  if (entry.type === "json") {
    return await fetchJsonFeed(entry, entry.tier);
  }
  if (entry.type === "manual_or_api") {
    console.warn(`[ingest] skip manual_or_api source: ${entry.id}`);
    return [];
  }
  return await fetchRssFeed(entry, entry.tier);
}

export async function aggregateNews(config: SourcesConfig): Promise<{
  items: NewsItem[];
  errors: string[];
}> {
  const sources = listEnabledSources(config);
  const items: NewsItem[] = [];
  const errors: string[] = [];

  const results = await Promise.all(
    sources.map(async (entry) => {
      if (isSkippedSource(entry)) {
        console.warn(`[ingest] skip manual_or_api source: ${entry.id}`);
        return { items: [] as NewsItem[], error: null as string | null };
      }
      try {
        const fetched = await fetchSource(entry);
        return { items: fetched, error: null };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { items: [], error: `${entry.id}: ${msg}` };
      }
    }),
  );

  for (const r of results) {
    items.push(...r.items);
    if (r.error) errors.push(r.error);
  }

  return { items, errors };
}
