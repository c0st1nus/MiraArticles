import { describe, expect, test } from "bun:test";
import { parseFeedXml } from "./fetch-rss";

const source = { id: "test_rss", url: "https://example.com/feed", tags: ["linux"] };

describe("parseFeedXml", () => {
  test("parses RSS 2.0 items", () => {
    const xml = `<?xml version="1.0"?>
<rss><channel>
  <item>
    <title>Hello RSS</title>
    <link>https://example.com/post/1</link>
    <pubDate>Mon, 19 May 2026 10:00:00 GMT</pubDate>
    <description><p>Short desc</p></description>
  </item>
</channel></rss>`;
    const items = parseFeedXml(xml, source, "fast");
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Hello RSS");
    expect(items[0]!.url).toBe("https://example.com/post/1");
    expect(items[0]!.summary).toContain("Short desc");
    expect(items[0]!.tier).toBe("fast");
    expect(items[0]!.postLang).toBe("en");
  });

  test("parses Atom entries", () => {
    const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Atom Title</title>
    <link href="https://example.com/atom/1" rel="alternate"/>
    <updated>2026-05-19T10:00:00Z</updated>
    <summary>Atom summary</summary>
  </entry>
</feed>`;
    const items = parseFeedXml(xml, source, "security");
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Atom Title");
    expect(items[0]!.url).toBe("https://example.com/atom/1");
  });
});
