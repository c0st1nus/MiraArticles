import { describe, expect, test } from "bun:test";
import { canonicalUrl } from "./canonical-url";
import { filterUnseen, pruneSeenEntries, type SeenEntry } from "./dedup";

describe("pruneSeenEntries", () => {
  test("drops entries older than 72h", () => {
    const now = Date.parse("2026-05-20T12:00:00Z");
    const entries: SeenEntry[] = [
      { url: "https://a.test/1", seenAt: "2026-05-10T12:00:00Z" },
      { url: "https://a.test/2", seenAt: "2026-05-19T12:00:00Z" },
    ];
    const pruned = pruneSeenEntries(entries, now);
    expect(pruned).toHaveLength(1);
    expect(pruned[0]!.url).toBe("https://a.test/2");
  });
});

describe("filterUnseen", () => {
  test("filters by canonical url", () => {
    const seen = new Set([canonicalUrl("https://x.test/a/?utm=1")]);
    const items = [{ url: "https://x.test/a/" }, { url: "https://x.test/b/" }];
    const out = filterUnseen(items, seen);
    expect(out).toHaveLength(1);
    expect(out[0]!.url).toBe("https://x.test/b/");
  });
});
