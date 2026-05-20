import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyDisclosure, shouldIncludeRefLink } from "./disclosure";

const ORIGINAL_REF = process.env.DISCLOSURE_REF_URL;
const ORIGINAL_ALWAYS_REF = process.env.DISCLOSURE_ALWAYS_REF;

afterEach(() => {
  if (ORIGINAL_REF === undefined) delete process.env.DISCLOSURE_REF_URL;
  else process.env.DISCLOSURE_REF_URL = ORIGINAL_REF;
  if (ORIGINAL_ALWAYS_REF === undefined) delete process.env.DISCLOSURE_ALWAYS_REF;
  else process.env.DISCLOSURE_ALWAYS_REF = ORIGINAL_ALWAYS_REF;
});

beforeEach(() => {
  delete process.env.DISCLOSURE_ALWAYS_REF;
});

describe("shouldIncludeRefLink", () => {
  test("low/medium risk subs allow ref", () => {
    expect(shouldIncludeRefLink("selfhosted")).toBe(true);
    expect(shouldIncludeRefLink("linux")).toBe(true);
    expect(shouldIncludeRefLink("devops")).toBe(true);
  });

  test("high/very_high subs disallow ref", () => {
    expect(shouldIncludeRefLink("netsec")).toBe(false);
    expect(shouldIncludeRefLink("technology")).toBe(false);
    expect(shouldIncludeRefLink("programming")).toBe(false);
  });

  test("DISCLOSURE_ALWAYS_REF overrides risk_promo", () => {
    process.env.DISCLOSURE_ALWAYS_REF = "true";
    expect(shouldIncludeRefLink("netsec")).toBe(true);
    delete process.env.DISCLOSURE_ALWAYS_REF;
  });
});

describe("applyDisclosure", () => {
  test("appends EN source and AI block for Reddit EN", () => {
    const out = applyDisclosure("Post body here.", {
      sourceUrl: "https://news.test/article",
      subreddit: "linux",
      platform: "reddit",
      postLang: "en",
    });
    expect(out).toContain("Post body here.");
    expect(out).toContain("Source: https://news.test/article");
    expect(out).toContain("AI-assisted");
    expect(out).toContain("t.me/mira");
    expect(out).toContain("Referral");
  });

  test("netsec omits ref link in footer", () => {
    const out = applyDisclosure("Advisory summary.", {
      sourceUrl: "https://cve.test/1",
      subreddit: "netsec",
      platform: "reddit",
      postLang: "en",
    });
    expect(out).toContain("Source:");
    expect(out).not.toContain("Mira (referral)");
    expect(out).not.toContain("Referral link");
  });

  test("uses custom DISCLOSURE_REF_URL when ref allowed", () => {
    process.env.DISCLOSURE_REF_URL = "https://t.me/mira?start=ref_test";
    const out = applyDisclosure("Body", {
      sourceUrl: "https://a.test",
      subreddit: "selfhosted",
      platform: "reddit",
      postLang: "en",
    });
    expect(out).toContain("ref_test");
  });
});
