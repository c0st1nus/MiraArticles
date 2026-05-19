/**
 * Unsplash Search API — hero images for article drafts.
 * @see https://unsplash.com/documentation#search-photos
 */

const UNSPLASH_API = "https://api.unsplash.com";

/** Source tags from config/sources.yaml → English search keywords */
export const TAG_SEARCH_KEYWORDS: Record<string, string> = {
  netsec: "cybersecurity",
  security: "cybersecurity",
  linux: "linux server",
  opensource: "open source software",
  devops: "devops cloud",
  selfhosted: "homelab server",
  sysadmin: "system administrator",
  programming: "software development",
  technology: "technology news",
  breaking: "breaking news technology",
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "as",
  "is",
  "was",
  "are",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "shall",
  "can",
  "need",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "i",
  "you",
  "he",
  "she",
  "we",
  "they",
  "what",
  "which",
  "who",
  "when",
  "where",
  "why",
  "how",
  "all",
  "each",
  "every",
  "both",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "nor",
  "not",
  "only",
  "own",
  "same",
  "so",
  "than",
  "too",
  "very",
  "just",
  "about",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "up",
  "down",
  "out",
  "off",
  "over",
  "under",
  "again",
  "further",
  "then",
  "once",
  "here",
  "there",
  "new",
  "says",
  "say",
  "said",
  "report",
  "reports",
  "update",
  "updates",
]);

export interface UnsplashPhoto {
  id: string;
  urls: {
    regular: string;
    small: string;
  };
  alt_description: string | null;
  user: {
    name: string;
    links: { html: string };
  };
  links: {
    html: string;
    download_location: string;
  };
}

export interface SearchPhotoOptions {
  perPage?: number;
  orientation?: "landscape" | "portrait" | "squarish";
  /** Override fetch (for tests). */
  fetchFn?: typeof fetch;
}

interface UnsplashSearchResponse {
  results: UnsplashPhoto[];
  total: number;
  total_pages: number;
}

function getAccessKey(): string {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key?.trim()) {
    throw new Error(
      "UNSPLASH_ACCESS_KEY is not set. Add it to .env (see .env.example).",
    );
  }
  return key.trim();
}

function authHeaders(): HeadersInit {
  return { Authorization: `Client-ID ${getAccessKey()}` };
}

function mapApiPhoto(raw: {
  id: string;
  urls?: { regular?: string; small?: string };
  alt_description?: string | null;
  user?: { name?: string; links?: { html?: string } };
  links?: { html?: string; download_location?: string };
}): UnsplashPhoto {
  const regular = raw.urls?.regular;
  const small = raw.urls?.small;
  const profile = raw.user?.links?.html;
  const page = raw.links?.html;
  const download = raw.links?.download_location;

  if (!regular || !small || !raw.user?.name || !profile || !page || !download) {
    throw new Error(`Unsplash photo ${raw.id} is missing required fields`);
  }

  return {
    id: raw.id,
    urls: { regular, small },
    alt_description: raw.alt_description ?? null,
    user: { name: raw.user.name, links: { html: profile } },
    links: { html: page, download_location: download },
  };
}

/** Strip stop words and non-alphanumeric tokens from title words. */
export function tokenizeTitle(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^-+|-+$/g, ""))
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/** Build an English search query from article title and source tags. */
export function buildPhotoSearchQuery(title: string, tags: string[]): string {
  const titleTokens = tokenizeTitle(title);
  const tagKeywords = tags
    .map((t) => t.toLowerCase().trim())
    .filter(Boolean)
    .map((t) => TAG_SEARCH_KEYWORDS[t] ?? t)
    .flatMap((kw) => kw.split(/\s+/));

  const seen = new Set<string>();
  const parts: string[] = [];

  for (const word of [...tagKeywords, ...titleTokens]) {
    const key = word.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      parts.push(word);
    }
  }

  const query = parts.slice(0, 8).join(" ").trim();
  return query || "technology computer";
}

export async function searchPhoto(
  query: string,
  options: SearchPhotoOptions = {},
): Promise<UnsplashPhoto | null> {
  const { perPage = 1, orientation = "landscape", fetchFn = fetch } = options;

  const params = new URLSearchParams({
    query: query.trim(),
    per_page: String(perPage),
    orientation,
  });

  const res = await fetchFn(`${UNSPLASH_API}/search/photos?${params}`, {
    headers: authHeaders(),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Unsplash search failed (${res.status}): ${body.slice(0, 200)}`,
    );
  }

  const data = (await res.json()) as UnsplashSearchResponse;
  const first = data.results[0];
  if (!first) return null;

  return mapApiPhoto(first);
}

export async function pickPhotoForArticle(
  title: string,
  tags: string[],
  options?: SearchPhotoOptions,
): Promise<UnsplashPhoto | null> {
  const query = buildPhotoSearchQuery(title, tags);
  return searchPhoto(query, options);
}

/**
 * Trigger download tracking (Unsplash API guidelines when using a photo).
 * @see https://unsplash.com/documentation#track-a-photo-download
 */
export async function trackDownload(
  photo: UnsplashPhoto,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchFn(photo.links.download_location, {
    headers: authHeaders(),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Unsplash download tracking failed (${res.status}): ${body.slice(0, 200)}`,
    );
  }
}
