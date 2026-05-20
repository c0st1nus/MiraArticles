import { describe, expect, test, afterEach } from "bun:test";
import {
  getAllowedSubreddits,
  getBlockedSubreddits,
  isSubredditAllowedForPublish,
  isSubredditBlocked,
  normalizeSubreddit,
} from "./reddit-policy";

const saved: Record<string, string | undefined> = {};

function setEnv(key: string, value: string | undefined) {
  saved[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("reddit-policy", () => {
  test("normalizeSubreddit strips r/ prefix", () => {
    expect(normalizeSubreddit("r/Technology")).toBe("technology");
  });

  test("getBlockedSubreddits defaults to technology and netsec", () => {
    delete process.env.REDDIT_BLOCKED_SUBREDDITS;
    expect(getBlockedSubreddits()).toEqual(["technology", "netsec"]);
  });

  test("getBlockedSubreddits parses comma list", () => {
    setEnv("REDDIT_BLOCKED_SUBREDDITS", "foo, r/bar ");
    expect(getBlockedSubreddits()).toEqual(["foo", "bar"]);
  });

  test("empty REDDIT_BLOCKED_SUBREDDITS disables blocking", () => {
    setEnv("REDDIT_BLOCKED_SUBREDDITS", "");
    expect(getBlockedSubreddits()).toEqual([]);
    expect(isSubredditBlocked("technology")).toBe(false);
  });

  test("getAllowedSubreddits returns null when unset", () => {
    delete process.env.REDDIT_ALLOWED_SUBREDDITS;
    expect(getAllowedSubreddits()).toBeNull();
  });

  test("isSubredditAllowedForPublish respects allowlist", () => {
    delete process.env.REDDIT_BLOCKED_SUBREDDITS;
    setEnv("REDDIT_ALLOWED_SUBREDDITS", "linux,devops");
    expect(isSubredditAllowedForPublish("linux")).toBe(true);
    expect(isSubredditAllowedForPublish("technology")).toBe(false);
  });
});
