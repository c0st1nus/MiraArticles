import { describe, expect, test, afterEach, beforeEach } from "bun:test";
import type { SourcesConfig } from "../config/load";
import {
  pickBestCandidate,
  resolveSubredditForTags,
  subredditForItem,
} from "./router";
import type { ScoredItem } from "./types";

const envBackup: Record<string, string | undefined> = {};

function setEnv(key: string, value: string | undefined) {
  if (!(key in envBackup)) envBackup[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

beforeEach(() => {
  setEnv("REDDIT_BLOCKED_SUBREDDITS", "");
  setEnv("REDDIT_ALLOWED_SUBREDDITS", undefined);
});

afterEach(() => {
  for (const [k, v] of Object.entries(envBackup)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  for (const k of Object.keys(envBackup)) delete envBackup[k];
});

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
    setEnv("ALLOW_R_PROGRAMMING", undefined);
    setEnv("REDDIT_BLOCKED_SUBREDDITS", "");
    expect(resolveSubredditForTags(["programming", "technology"], routeMap)).toBe("technology");
  });

  test("skips blocked technology and uses linux when technology blocked", () => {
    setEnv("REDDIT_BLOCKED_SUBREDDITS", "technology,netsec");
    setEnv("ALLOW_R_PROGRAMMING", undefined);
    expect(resolveSubredditForTags(["programming", "technology"], routeMap)).toBe("linux");
  });
});

describe("subredditForItem", () => {
  test("falls back to technology when only programming tag and technology allowed", () => {
    setEnv("ALLOW_R_PROGRAMMING", undefined);
    setEnv("REDDIT_BLOCKED_SUBREDDITS", "");
    const sub = subredditForItem(scored({ tags: ["programming"] }), routeMap);
    expect(sub).toBe("technology");
  });

  test("falls back to linux when only programming tag and technology blocked", () => {
    setEnv("ALLOW_R_PROGRAMMING", undefined);
    setEnv("REDDIT_BLOCKED_SUBREDDITS", "technology,netsec");
    const sub = subredditForItem(scored({ tags: ["programming"] }), routeMap);
    expect(sub).toBe("linux");
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
    setEnv("REDDIT_BLOCKED_SUBREDDITS", "");
    const items = [
      scored({ title: "a", score: 100, tags: ["linux"] }),
      scored({ title: "b", score: 100, tags: ["netsec"] }),
    ];
    const first = pickBestCandidate(items, routeMap);
    const second = pickBestCandidate(items, routeMap, first?.subreddit);
    expect(first?.subreddit).not.toBe(second?.subreddit);
  });

  test("skips technology when blocked and picks next score tier", () => {
    setEnv("REDDIT_BLOCKED_SUBREDDITS", "technology,netsec");
    const items = [
      scored({ title: "tech", score: 120, tags: ["technology"] }),
      scored({ title: "linux", score: 80, tags: ["linux"] }),
    ];
    const pick = pickBestCandidate(items, routeMap);
    expect(pick?.title).toBe("linux");
    expect(pick?.subreddit).toBe("linux");
  });

  test("skips netsec tier when blocked at equal score", () => {
    setEnv("REDDIT_BLOCKED_SUBREDDITS", "technology,netsec");
    const items = [
      scored({ title: "netsec", score: 100, tags: ["netsec"] }),
      scored({ title: "linux", score: 100, tags: ["linux"] }),
    ];
    const pick = pickBestCandidate(items, routeMap);
    expect(pick?.subreddit).toBe("linux");
  });

  test("prefers allowed subreddit at same score when allowlist set", () => {
    setEnv("REDDIT_BLOCKED_SUBREDDITS", "");
    setEnv("REDDIT_ALLOWED_SUBREDDITS", "linux,devops");
    const items = [
      scored({ title: "netsec", score: 100, tags: ["netsec"] }),
      scored({ title: "linux", score: 100, tags: ["linux"] }),
    ];
    const pick = pickBestCandidate(items, routeMap);
    expect(pick?.subreddit).toBe("linux");
  });
});
