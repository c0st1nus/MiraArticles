const DEFAULT_BLOCKED = ["technology", "netsec"];

/** Normalize subreddit name (strip r/, lowercase). */
export function normalizeSubreddit(name: string): string {
  return name.trim().replace(/^r\//i, "").toLowerCase();
}

function parseCsvEnv(value: string): string[] {
  return value
    .split(",")
    .map((s) => normalizeSubreddit(s))
    .filter(Boolean);
}

/**
 * Subreddits that reject self/text posts or are otherwise unsafe for autopost.
 * Default: technology,netsec. Set REDDIT_BLOCKED_SUBREDDITS= to disable blocking.
 */
export function getBlockedSubreddits(): string[] {
  const raw = process.env.REDDIT_BLOCKED_SUBREDDITS;
  if (raw === undefined) {
    return DEFAULT_BLOCKED.map(normalizeSubreddit);
  }
  if (raw.trim() === "") {
    return [];
  }
  return parseCsvEnv(raw);
}

/** Optional allowlist for publish + ingest routing preference. Unset = no restriction. */
export function getAllowedSubreddits(): string[] | null {
  const raw = process.env.REDDIT_ALLOWED_SUBREDDITS;
  if (raw === undefined || raw.trim() === "") {
    return null;
  }
  const parsed = parseCsvEnv(raw);
  return parsed.length > 0 ? parsed : null;
}

export function isSubredditBlocked(sr: string): boolean {
  const norm = normalizeSubreddit(sr);
  return getBlockedSubreddits().includes(norm);
}

export function isSubredditAllowedForPublish(sr: string): boolean {
  const norm = normalizeSubreddit(sr);
  if (isSubredditBlocked(norm)) return false;
  const allowed = getAllowedSubreddits();
  if (allowed === null) return true;
  return allowed.includes(norm);
}

export function blockedSubredditError(sr: string): string {
  return (
    `Subreddit '${normalizeSubreddit(sr)}' is blocked (self/text posts not allowed; ` +
    `adjust REDDIT_BLOCKED_SUBREDDITS or route elsewhere)`
  );
}

export function notInAllowlistError(sr: string): string {
  const allowed = getAllowedSubreddits() ?? [];
  return (
    `Subreddit '${normalizeSubreddit(sr)}' is not in REDDIT_ALLOWED_SUBREDDITS ` +
    `(${allowed.join(", ")})`
  );
}
