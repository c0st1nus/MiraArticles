import { describe, expect, test } from "bun:test";
import type { SourcesConfig } from "../config/load";
import {
  pickBestCandidate,
  resolveSubredditForTags,
  subredditForItem,
} from "./router";
import type { ScoredItem } from "./types";

const routeMap: SourcesConfig["route_to_subreddit"] = {
  netsec: "netsec",
  security: "netsec",
  linux: "linux",
  programming: "programming",
  technology: "technology",
  default: "linux",
};

function scored(overrides: Partial<ScoredItem> = {}): ScoredItem {
  return {
    title: "CVE fix",
    url: "https://x.test/cve",
    summary: "desc",
    publishedAt: new Date(),
    source: "bleeping",
    tags: ["netsec"],
    tier: "fast",
    postLang: "en",
    score: 100,
    ...overrides,
  };
}

describe("resolveSubredditForTags", () => {
  test("maps first matching tag", () => {
    expect(resolveSubredditForTags(["linux", "netsec"], routeMap)).toBe("linux");
    expect(resolveSubredditForTags(["netsec"], routeMap)).toBe("netsec");
  });

  test("falls back to default", () => {
    expect(resolveSubredditForTags(["unknown"], routeMap)).toBe("linux");
  });

  test("skips programming and uses next tag when not allowed", () => {
    const prev = process.env.ALLOW_R_PROGRAMMING;
    delete process.env.ALLOW_R_PROGRAMMING;
    expect(resolveSubredditForTags(["programming", "technology"], routeMap)).toBe("technology");
    if (prev !== undefined) process.env.ALLOW_R_PROGRAMMING = prev;
  });
});

describe("subredditForItem", () => {
  test("falls back to technology when only programming tag", () => {
    const prev = process.env.ALLOW_R_PROGRAMMING;
    delete process.env.ALLOW_R_PROGRAMMING;
    const sub = subredditForItem(scored({ tags: ["programming"] }), routeMap);
    expect(sub).toBe("technology");
    if (prev !== undefined) process.env.ALLOW_R_PROGRAMMING = prev;
  });

  test("uses programming when allowed", () => {
    const prev = process.env.ALLOW_R_PROGRAMMING;
    process.env.ALLOW_R_PROGRAMMING = "true";
    const sub = subredditForItem(scored({ tags: ["programming"] }), routeMap);
    expect(sub).toBe("programming");
    if (prev !== undefined) process.env.ALLOW_R_PROGRAMMING = prev;
    else delete process.env.ALLOW_R_PROGRAMMING;
  });
});

describe("pickBestCandidate", () => {
  test("picks highest score", () => {
    const items = [
      scored({ title: "low", score: 50, tags: ["linux"] }),
      scored({ title: "high", score: 120, tags: ["netsec"] }),
    ];
    const pick = pickBestCandidate(items, routeMap);
    expect(pick?.title).toBe("high");
    expect(pick?.subreddit).toBe("netsec");
  });

  test("rotates on tie across subs", () => {
    const items = [
      scored({ title: "a", score: 100, tags: ["linux"] }),
      scored({ title: "b", score: 100, tags: ["netsec"] }),
    ];
    const first = pickBestCandidate(items, routeMap);
    const second = pickBestCandidate(items, routeMap, first?.subreddit);
    expect(first?.subreddit).not.toBe(second?.subreddit);
  });
});
