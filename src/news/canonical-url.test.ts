import { describe, expect, test } from "bun:test";
import { canonicalUrl } from "./canonical-url";

describe("canonicalUrl", () => {
  test("strips utm params", () => {
    const u = canonicalUrl("https://example.com/a?utm_source=x&id=1");
    expect(u).toBe("https://example.com/a?id=1");
  });

  test("removes trailing slash", () => {
    expect(canonicalUrl("https://example.com/path/")).toBe("https://example.com/path");
  });

  test("upgrades http to https", () => {
    expect(canonicalUrl("http://example.com/x")).toBe("https://example.com/x");
  });

  test("same canonical for tracking variants", () => {
    const a = canonicalUrl("https://news.test/item?utm_campaign=a");
    const b = canonicalUrl("https://news.test/item?utm_medium=b");
    expect(a).toBe(b);
  });
});
