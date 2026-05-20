import { describe, expect, it } from "bun:test";
import { parseFlairList, resolveFlairForSubreddit } from "./reddit-flair";

describe("resolveFlairForSubreddit", () => {
  const flairs = [
    { id: "flair_a", text: "Meme" },
    { id: "flair_b", text: "News" },
    { id: "flair_c", text: "Discussion" },
  ];

  it("prefers default_flair_id from config", () => {
    const r = resolveFlairForSubreddit("linux", flairs, { default_flair_id: "flair_b" });
    expect(r.flairId).toBe("flair_b");
  });

  it("matches default_flair_text to API list", () => {
    const r = resolveFlairForSubreddit("linux", flairs, { default_flair_text: "news" });
    expect(r.flairId).toBe("flair_b");
  });

  it("partial match: News → Distro News", () => {
    const r = resolveFlairForSubreddit(
      "linux",
      [
        { id: "a", text: "Distro News" },
        { id: "b", text: "Meme" },
      ],
      { default_flair_text: "News" },
    );
    expect(r.flairId).toBe("a");
  });

  it("uses heuristic when default_flair_text not in list", () => {
    const r = resolveFlairForSubreddit("linux", flairs, { default_flair_text: "Custom" });
    expect(r.flairId).toBe("flair_b");
  });

  it("uses REDDIT_DEFAULT_FLAIR_TEXT env", () => {
    process.env.REDDIT_DEFAULT_FLAIR_TEXT = "Discussion";
    const r = resolveFlairForSubreddit("linux", flairs, {});
    expect(r.flairId).toBe("flair_c");
    delete process.env.REDDIT_DEFAULT_FLAIR_TEXT;
  });

  it("heuristic prefers news/discussion-like labels", () => {
    const r = resolveFlairForSubreddit(
      "linux",
      [
        { id: "x1", text: "Meme" },
        { id: "x2", text: "Random" },
        { id: "x3", text: "Software Release" },
      ],
      {},
    );
    expect(r.flairId).toBe("x3");
  });

  it("falls back to first flair", () => {
    const r = resolveFlairForSubreddit("linux", [{ id: "only", text: "Other" }], {});
    expect(r.flairId).toBe("only");
  });
});

describe("parseFlairList", () => {
  it("parses array of id/text objects", () => {
    const list = parseFlairList([
      { id: "a", text: "News" },
      { id: "b", text: "Ask" },
    ]);
    expect(list).toEqual([
      { id: "a", text: "News" },
      { id: "b", text: "Ask" },
    ]);
  });
});
