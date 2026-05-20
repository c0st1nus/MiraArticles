import type { SourceEntry, TierName } from "../config/load";
import { fetchWithRetry } from "./fetch-with-retry";
import { FETCH_TIMEOUT_MS, INGEST_USER_AGENT } from "./fetch-rss";
import type { NewsItem } from "./types";

interface KevVulnerability {
  cveID?: string;
  dateAdded?: string;
  shortDescription?: string;
  vulnerabilityName?: string;
  vendorProject?: string;
  product?: string;
}

interface KevFeed {
  vulnerabilities?: KevVulnerability[];
  catalogVersion?: string;
  dateReleased?: string;
}

function cveUrl(cveId: string): string {
  return `https://www.cve.org/CVERecord?id=${encodeURIComponent(cveId)}`;
}

export function parseCisaKevJson(
  data: KevFeed,
  source: SourceEntry,
  tier: TierName,
): NewsItem[] {
  const items: NewsItem[] = [];
  for (const v of data.vulnerabilities ?? []) {
    const cveId = v.cveID?.trim();
    if (!cveId) continue;

    const title =
      v.vulnerabilityName?.trim() ||
      `${cveId}${v.vendorProject ? ` — ${v.vendorProject}` : ""}`;
    const summary = v.shortDescription?.trim() ?? "";
    const publishedAt = v.dateAdded ? new Date(v.dateAdded) : new Date();
    const date = Number.isNaN(publishedAt.getTime()) ? new Date() : publishedAt;

    items.push({
      title,
      url: cveUrl(cveId),
      summary: summary.slice(0, 500),
      publishedAt: date,
      source: source.id,
      tags: [...source.tags],
      tier,
      postLang: "en",
    });
  }
  return items;
}

export async function fetchJsonFeed(
  source: SourceEntry,
  tier: TierName,
): Promise<NewsItem[]> {
  const res = await fetchWithRetry(source.url, {
    headers: { "User-Agent": INGEST_USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`${source.id}: HTTP ${res.status}`);
  }
  const data = (await res.json()) as KevFeed;

  if (source.id === "cisa_kev") {
    return parseCisaKevJson(data, source, tier);
  }

  throw new Error(`${source.id}: unsupported JSON feed`);
}

export { FETCH_TIMEOUT_MS };
