import { describe, expect, test } from "bun:test";
import { applyStalePenalty, hoursSince, scoreItem } from "./scoring";
import type { NewsItem, ScoredItem } from "./types";

function item(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    title: "t",
    url: "https://x.test/1",
    summary: "s",
    publishedAt: new Date(),
    source: "test",
    tags: ["linux"],
    tier: "fast",
    postLang: "en",
    ...overrides,
  };
}

describe("scoreItem", () => {
  const now = new Date("2026-05-20T12:00:00Z");

  test("fast tier beats vendor for same freshness", () => {
    const pub = new Date("2026-05-20T10:00:00Z");
    const fast = scoreItem(item({ tier: "fast", publishedAt: pub }), now);
    const vendor = scoreItem(item({ tier: "vendor", publishedAt: pub }), now);
    expect(fast).toBeGreaterThan(vendor);
  });

  test("fresh item gets freshness bonus", () => {
    const fresh = scoreItem(
      item({ publishedAt: new Date("2026-05-20T11:00:00Z") }),
      now,
    );
    const stale = scoreItem(
      item({ publishedAt: new Date("2026-05-18T12:00:00Z") }),
      now,
    );
    expect(fresh).toBeGreaterThan(stale);
  });

  test("penalizes >24h when fresh candidates exist", () => {
    const old = scoreItem(item({ publishedAt: new Date("2026-05-10T12:00:00Z") }), now);
    const oldNoPenalty = scoreItem(
      item({ publishedAt: new Date("2026-05-10T12:00:00Z") }),
      now,
      { penalizeStale: false },
    );
    expect(old).toBeLessThan(oldNoPenalty);
  });

  test("penalizes known paywall hosts", () => {
    const pub = new Date("2026-05-20T11:00:00Z");
    const open = scoreItem(item({ publishedAt: pub, url: "https://example.com/article" }), now);
    const paywall = scoreItem(
      item({ publishedAt: pub, url: "https://www.wsj.com/tech/apple-chips" }),
      now,
    );
    expect(paywall).toBeLessThan(open * 0.1);
    expect(paywall).toBe(open * 0.05);
  });
});

describe("applyStalePenalty", () => {
  test("removes stale multiplier when all items old", () => {
    const now = new Date("2026-05-20T12:00:00Z");
    const oldDate = new Date("2026-05-10T12:00:00Z");
    const scored: ScoredItem[] = [
      { ...item({ publishedAt: oldDate }), score: scoreItem(item({ publishedAt: oldDate }), now) },
    ];
    const adjusted = applyStalePenalty(scored, now);
    expect(adjusted[0]!.score).toBeGreaterThan(scored[0]!.score);
  });
});

describe("hoursSince", () => {
  test("computes hours", () => {
    const now = new Date("2026-05-20T12:00:00Z");
    const pub = new Date("2026-05-20T06:00:00Z");
    expect(hoursSince(pub, now)).toBe(6);
  });
});
