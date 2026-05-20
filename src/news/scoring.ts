import type { TierName } from "../config/load";
import type { NewsItem, ScoredItem } from "./types";

const TIER_WEIGHT: Record<TierName, number> = {
  fast: 100,
  security: 80,
  quality: 50,
  vendor: 40,
};

const PAYWALL_HOSTS = new Set([
  "wsj.com",
  "ft.com",
  "nytimes.com",
  "economist.com",
  "bloomberg.com",
  "barrons.com",
]);

const PAYWALL_MULTIPLIER = 0.05;

function isPaywallUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return PAYWALL_HOSTS.has(host);
  } catch {
    return false;
  }
}

export function hoursSince(date: Date, now = new Date()): number {
  return (now.getTime() - date.getTime()) / (1000 * 60 * 60);
}

export function scoreItem(
  item: NewsItem,
  now = new Date(),
  options?: { penalizeStale?: boolean },
): number {
  const tier = item.tier ?? "quality";
  const base = TIER_WEIGHT[tier] ?? 50;
  const hours = hoursSince(item.publishedAt, now);
  const freshnessBonus = Math.max(0, 60 - hours) * 2;
  let score = base + freshnessBonus;

  const penalize = options?.penalizeStale !== false;
  if (penalize && hours > 24) {
    score *= 0.1;
  }

  if (isPaywallUrl(item.url)) {
    score *= PAYWALL_MULTIPLIER;
  }

  return score;
}

export function scoreItems(items: NewsItem[], now = new Date()): ScoredItem[] {
  return items.map((item) => ({
    ...item,
    score: scoreItem(item, now),
  }));
}

/** Relax 24h penalty when every candidate is older than 24h. */
export function applyStalePenalty(items: ScoredItem[], now = new Date()): ScoredItem[] {
  const hasFresh = items.some((i) => hoursSince(i.publishedAt, now) <= 24);
  if (hasFresh) return items;

  return items.map((item) => ({
    ...item,
    score: scoreItem(item, now, { penalizeStale: false }),
  }));
}

export function pickBestScored(items: ScoredItem[]): ScoredItem | null {
  if (items.length === 0) return null;
  let best = items[0]!;
  for (let i = 1; i < items.length; i++) {
    const cur = items[i]!;
    if (cur.score > best.score) best = cur;
  }
  return best;
}
