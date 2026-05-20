import { XMLParser } from "fast-xml-parser";
import type { SourceEntry, TierName } from "../config/load";
import { fetchWithRetry } from "./fetch-with-retry";
import type { NewsItem } from "./types";

export const INGEST_USER_AGENT = "MiraArticles/1.0 (news-ingest)";
export { FETCH_TIMEOUT_MS } from "./fetch-with-retry";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  parseTagValue: true,
  isArray: (name) => name === "item" || name === "entry" || name === "link",
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Recursively extract text from fast-xml-parser nodes (strings, #text, nested tags, arrays). */
function textField(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (Array.isArray(value)) {
    return value
      .map((v) => textField(v))
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("#text" in obj) {
      const t = textField(obj["#text"]);
      if (t) return t;
    }
    return Object.entries(obj)
      .filter(([k]) => !k.startsWith("@_"))
      .map(([, v]) => textField(v))
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  return "";
}

function parseDate(raw: string | undefined): Date {
  if (!raw?.trim()) return new Date();
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function summaryFromDescription(raw: string): string {
  const text = raw.includes("<") ? stripHtml(raw) : raw.trim();
  if (text.length <= 500) return text;
  return `${text.slice(0, 497)}...`;
}

function atomLink(entry: Record<string, unknown>): string {
  const links = asArray<Record<string, unknown>>(entry.link);
  for (const l of links) {
    const href = textField(l["@_href"]) || textField(l.href);
    const rel = textField(l["@_rel"]);
    if (href && (!rel || rel === "alternate")) return href;
  }
  for (const l of links) {
    const href = textField(l["@_href"]) || textField(l.href);
    if (href) return href;
  }
  return "";
}

function parseRssItems(
  channel: Record<string, unknown>,
  source: SourceEntry,
  tier: TierName,
): NewsItem[] {
  const items: NewsItem[] = [];
  for (const item of asArray<Record<string, unknown>>(channel.item)) {
    const title = textField(item.title);
    const link = textField(item.link) || textField(item.guid);
    if (!title || !link) continue;

    const pubDate =
      textField(item.pubDate) || textField(item["dc:date"]) || textField(item.date);
    const description =
      textField(item.description) ||
      textField(item.summary) ||
      textField(item["content:encoded"]);

    items.push({
      title,
      url: link,
      summary: summaryFromDescription(description),
      publishedAt: parseDate(pubDate),
      source: source.id,
      tags: [...source.tags],
      tier,
      postLang: "en",
    });
  }
  return items;
}

function parseAtomEntries(
  feed: Record<string, unknown>,
  source: SourceEntry,
  tier: TierName,
): NewsItem[] {
  const items: NewsItem[] = [];
  for (const entry of asArray<Record<string, unknown>>(feed.entry)) {
    const title = textField(entry.title);
    const link = atomLink(entry);
    if (!title || !link) continue;

    const updated = textField(entry.updated) || textField(entry.published);
    const summary = textField(entry.summary) || textField(entry.content);

    items.push({
      title,
      url: link,
      summary: summaryFromDescription(summary),
      publishedAt: parseDate(updated),
      source: source.id,
      tags: [...source.tags],
      tier,
      postLang: "en",
    });
  }
  return items;
}

export function parseFeedXml(xml: string, source: SourceEntry, tier: TierName): NewsItem[] {
  const parsed = xmlParser.parse(xml) as Record<string, unknown>;

  const rss = parsed.rss as Record<string, unknown> | undefined;
  if (rss?.channel) {
    return parseRssItems(rss.channel as Record<string, unknown>, source, tier);
  }

  const channel = parsed.channel as Record<string, unknown> | undefined;
  if (channel) {
    return parseRssItems(channel, source, tier);
  }

  const feed = parsed.feed as Record<string, unknown> | undefined;
  if (feed) {
    return parseAtomEntries(feed, source, tier);
  }

  return [];
}

export async function fetchRssFeed(
  source: SourceEntry,
  tier: TierName,
): Promise<NewsItem[]> {
  const res = await fetchWithRetry(source.url, {
    headers: {
      "User-Agent": INGEST_USER_AGENT,
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    },
  });
  if (!res.ok) {
    throw new Error(`${source.id}: HTTP ${res.status}`);
  }
  const xml = await res.text();
  return parseFeedXml(xml, source, tier);
}
