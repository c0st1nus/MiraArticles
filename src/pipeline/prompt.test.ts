import { describe, expect, test } from "bun:test";
import type { IngestCandidate } from "../news/types";
import { buildMiraPrompt } from "./prompt";

function sampleCandidate(overrides: Partial<IngestCandidate> = {}): IngestCandidate {
  return {
    title: "Linux 6.14-rc1 released",
    url: "https://example.com/linux-6-14",
    summary: "Kernel RC with scheduler tweaks.",
    publishedAt: new Date("2026-05-20T10:00:00Z"),
    source: "phoronix",
    tags: ["linux"],
    score: 42,
    subreddit: "linux",
    postLang: "en",
    ...overrides,
  };
}

describe("buildMiraPrompt", () => {
  test("includes news fields and r/subreddit for Reddit", () => {
    const prompt = buildMiraPrompt(sampleCandidate(), {
      platform: "reddit",
      subreddit: "linux",
    });
    expect(prompt).toContain("Linux 6.14-rc1 released");
    expect(prompt).toContain("https://example.com/linux-6-14");
    expect(prompt).toContain("Kernel RC");
    expect(prompt).toContain("r/linux");
    expect(prompt).toContain("Language: English");
    expect(prompt).toContain("150–400 words");
  });

  test("explicitly forbids ref link and disclaimer in Mira output", () => {
    const prompt = buildMiraPrompt(sampleCandidate(), {
      platform: "reddit",
      subreddit: "selfhosted",
    });
    expect(prompt.toLowerCase()).toContain("do not");
    expect(prompt).toContain("referral");
    expect(prompt).toContain("disclaimer");
  });

  test("X platform uses shorter length hint", () => {
    const prompt = buildMiraPrompt(sampleCandidate({ subreddit: "linux" }), {
      platform: "x",
      subreddit: "MiraArticles",
    });
    expect(prompt).toContain("240 characters");
    expect(prompt).not.toContain("r/linux");
  });
});
