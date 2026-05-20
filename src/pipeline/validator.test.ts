import { afterEach, describe, expect, test } from "bun:test";
import type { PipelineDraft } from "./types";
import {
  jaccardSimilarity,
  maxSimilarityToRecent,
  tokenizeForSimilarity,
  validateDraft,
} from "./validator";

function baseDraft(overrides: Partial<PipelineDraft> = {}): PipelineDraft {
  return {
    title: "Test title",
    url: "https://example.com/a",
    summary: "summary",
    publishedAt: new Date(),
    source: "test",
    tags: ["linux"],
    score: 1,
    subreddit: "linux",
    postLang: "en",
    platform: "reddit",
    status: "validated",
    errors: [],
    body: "Unique post body about kernel releases and scheduling.",
    redditTitle: "Test title",
    ...overrides,
  };
}

describe("jaccardSimilarity", () => {
  test("identical token sets score 1", () => {
    const a = tokenizeForSimilarity("alpha beta gamma delta");
    const b = tokenizeForSimilarity("alpha beta gamma delta");
    expect(jaccardSimilarity(a, b)).toBe(1);
  });

  test("disjoint sets score 0", () => {
    const a = tokenizeForSimilarity("foo bar baz");
    const b = tokenizeForSimilarity("qux quux corge");
    expect(jaccardSimilarity(a, b)).toBe(0);
  });
});

describe("validateDraft", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  test("passes valid reddit draft", () => {
    const result = validateDraft(baseDraft(), { recentBodies: [] });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("fails when reddit title too long", () => {
    const result = validateDraft(
      baseDraft({ redditTitle: "x".repeat(301) }),
      { recentBodies: [] },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("300"))).toBe(true);
  });

  test("fails on forbidden word from env", () => {
    process.env.FORBIDDEN_WORDS = "kernel releases";
    const result = validateDraft(baseDraft(), { recentBodies: [] });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("forbidden"))).toBe(true);
  });

  test("fails when similar to recent published body", () => {
    const body =
      "Homelab backup release adds restic integration scheduling defaults for self-hosted stacks without SaaS.";
    const recent = body.replace("stacks", "servers");
    const sim = maxSimilarityToRecent(body, [recent]);
    expect(sim).toBeGreaterThanOrEqual(0.85);
    const result = validateDraft(baseDraft({ body }), { recentBodies: [recent] });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("similar"))).toBe(true);
  });

  test("x platform enforces 280 char limit by default", () => {
    const result = validateDraft(
      baseDraft({ platform: "x", body: "a".repeat(281) }),
      { recentBodies: [] },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("280"))).toBe(true);
  });
});
