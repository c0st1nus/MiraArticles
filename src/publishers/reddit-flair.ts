import { loadCredentials, refreshAccessToken } from "./reddit-auth";
import { loadSubredditsConfig } from "../config/load";
import type { SubredditEntry } from "../config/load";

export interface LinkFlair {
  id: string;
  text: string;
}

export interface FlairResolveConfig {
  default_flair_id?: string;
  default_flair_text?: string;
}

export interface FetchLinkFlairsOpts {
  fetchFn?: typeof fetch;
  accessToken: string;
  userAgent: string;
}

const FLAIR_HEURISTIC = /news|discussion|general|software|release/i;

export function parseFlairList(data: unknown): LinkFlair[] {
  let raw: unknown[] | undefined;
  if (Array.isArray(data)) {
    raw = data;
  } else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.flair_list)) raw = obj.flair_list;
    else if (Array.isArray(obj.choices)) raw = obj.choices;
  }
  if (!raw) return [];

  const out: LinkFlair[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : undefined;
    const text =
      typeof row.text === "string"
        ? row.text
        : typeof row.flair_text === "string"
          ? row.flair_text
          : undefined;
    if (id && text) out.push({ id, text });
  }
  return out;
}

async function fetchFlairEndpoint(
  sr: string,
  endpoint: "link_flair_v2" | "link_flair",
  opts: FetchLinkFlairsOpts,
): Promise<LinkFlair[]> {
  const fetchFn = opts.fetchFn ?? fetch;
  const url = `https://oauth.reddit.com/r/${sr}/api/${endpoint}`;
  const resp = await fetchFn(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "User-Agent": opts.userAgent,
    },
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  return parseFlairList(data);
}

/** GET link flairs for a subreddit (v2, then legacy link_flair). */
export async function fetchLinkFlairs(
  sr: string,
  opts: FetchLinkFlairsOpts,
): Promise<LinkFlair[]> {
  const v2 = await fetchFlairEndpoint(sr, "link_flair_v2", opts);
  if (v2.length > 0) return v2;
  return fetchFlairEndpoint(sr, "link_flair", opts);
}

function subredditFlairConfig(sr: string): FlairResolveConfig | undefined {
  const cfg = loadSubredditsConfig();
  const entry = cfg.subreddits.find((s) => s.name === sr);
  if (!entry) return undefined;
  const { default_flair_id, default_flair_text } = entry;
  if (!default_flair_id && !default_flair_text) return undefined;
  return { default_flair_id, default_flair_text };
}

function matchFlairByText(flairs: LinkFlair[], text: string): LinkFlair | undefined {
  const norm = text.trim().toLowerCase();
  const exact = flairs.find((f) => f.text.trim().toLowerCase() === norm);
  if (exact) return exact;
  // e.g. yaml "News" → "Distro News" on r/linux
  return flairs.find((f) => f.text.trim().toLowerCase().includes(norm));
}

/** r/linux and similar subs reject flair_text without flair_id when templates exist. */
function resolveFromList(
  sr: string,
  flairs: LinkFlair[],
  config?: FlairResolveConfig,
): { flairId?: string; flairText?: string } {
  if (cfgId(config)) {
    const id = cfgId(config)!;
    const byId = flairs.find((f) => f.id === id);
    if (byId) return { flairId: byId.id };
    if (flairs.length === 0) return { flairId: id };
  }

  const text = cfgText(config) ?? process.env.REDDIT_DEFAULT_FLAIR_TEXT?.trim();
  if (text) {
    const matched = matchFlairByText(flairs, text);
    if (matched) return { flairId: matched.id };
  }

  if (flairs.length === 0) {
    if (text) return { flairText: text };
    return {};
  }

  const heuristic = flairs.find((f) => FLAIR_HEURISTIC.test(f.text));
  if (heuristic) return { flairId: heuristic.id };

  return { flairId: flairs[0]!.id };
}

function cfgId(config?: FlairResolveConfig): string | undefined {
  return config?.default_flair_id?.trim() || undefined;
}

function cfgText(config?: FlairResolveConfig): string | undefined {
  return config?.default_flair_text?.trim() || undefined;
}

/**
 * Resolve flair for submit: flair_id when id known, else flair_text.
 * Priority: per-sub yaml → REDDIT_DEFAULT_FLAIR_TEXT → heuristic → first.
 */
export function resolveFlairForSubreddit(
  sr: string,
  flairs: LinkFlair[],
  config?: FlairResolveConfig,
): { flairId?: string; flairText?: string } {
  const cfg = config ?? subredditFlairConfig(sr);
  return resolveFromList(sr, flairs, cfg);
}

export function isProfileSubreddit(sr: string): boolean {
  return /^u_/i.test(sr);
}

export function flairRequiredHint(sr: string): string {
  return (
    `Subreddit r/${sr} may require post flair. ` +
    `Set default_flair_text (or default_flair_id) for "${sr}" in config/subreddits.yaml, ` +
    `or REDDIT_DEFAULT_FLAIR_TEXT in .env. Flair IDs: GET /r/${sr}/api/link_flair_v2 via OAuth.`
  );
}

/** Lookup subreddit entry (for tests / tooling). */
export function getSubredditConfigEntry(sr: string): SubredditEntry | undefined {
  const cfg = loadSubredditsConfig();
  return cfg.subreddits.find((s) => s.name === sr);
}

const FLAIR_CACHE_TTL_MS = 60 * 60 * 1000;
const flairCache = new Map<string, { flairs: LinkFlair[]; expiresAt: number }>();

export function clearFlairCache(): void {
  flairCache.clear();
}

export async function fetchLinkFlairsCached(
  sr: string,
  opts?: { fetchFn?: typeof fetch },
): Promise<LinkFlair[]> {
  const now = Date.now();
  const hit = flairCache.get(sr);
  if (hit && hit.expiresAt > now) return hit.flairs;

  const creds = loadCredentials();
  const { accessToken } = await refreshAccessToken(creds, opts?.fetchFn);
  const flairs = await fetchLinkFlairs(sr, {
    fetchFn: opts?.fetchFn,
    accessToken,
    userAgent: creds.userAgent,
  });
  flairCache.set(sr, { flairs, expiresAt: now + FLAIR_CACHE_TTL_MS });
  return flairs;
}

export interface ResolveFlairForPublishResult {
  ok: boolean;
  flairId?: string;
  flairText?: string;
  error?: string;
}

/** Fetch (cached) flairs and resolve for submit; skips profile subs. */
export async function resolveFlairForPublish(
  sr: string,
  opts?: { fetchFn?: typeof fetch },
): Promise<ResolveFlairForPublishResult> {
  if (isProfileSubreddit(sr)) {
    return { ok: true };
  }

  let flairs: LinkFlair[];
  try {
    flairs = await fetchLinkFlairsCached(sr, opts);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to fetch link flairs for r/${sr}: ${msg}` };
  }

  const yamlDefaults = subredditFlairConfig(sr);
  const resolved = resolveFlairForSubreddit(sr, flairs, yamlDefaults);

  if (resolved.flairId) {
    return { ok: true, flairId: resolved.flairId };
  }

  if (flairs.length === 0) {
    return {
      ok: false,
      error:
        flairRequiredHint(sr) +
        (resolved.flairText
          ? ` (tried flair_text=${resolved.flairText} but no templates loaded)`
          : ""),
    };
  }

  return {
    ok: false,
    error:
      `Could not resolve flair_id for r/${sr}. ` +
      `Available: ${flairs.map((f) => f.text).join(", ")}. ${flairRequiredHint(sr)}`,
  };
}
