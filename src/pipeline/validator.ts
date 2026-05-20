import type { PipelineDraft } from "./types";

export interface ValidateDraftOpts {
  recentBodies: string[];
}

export interface ValidateDraftResult {
  ok: boolean;
  errors: string[];
}

const DEFAULT_FORBIDDEN = ["click here", "buy now", "limited offer"];

function parseForbiddenWords(): string[] {
  const extra = process.env.FORBIDDEN_WORDS?.trim();
  const fromEnv = extra
    ? extra.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean)
    : [];
  return [...DEFAULT_FORBIDDEN.map((w) => w.toLowerCase()), ...fromEnv];
}

function similarityMax(): number {
  const v = Number(process.env.SIMILARITY_MAX ?? "0.85");
  return Number.isFinite(v) ? v : 0.85;
}

function xCharLimit(): number {
  return process.env.X_PREMIUM === "true" ? 25_000 : 280;
}

export function tokenizeForSimilarity(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  return new Set(words);
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) {
    if (b.has(w)) intersection++;
  }
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

export function maxSimilarityToRecent(
  body: string,
  recentBodies: string[],
): number {
  const tokens = tokenizeForSimilarity(body);
  let max = 0;
  for (const prev of recentBodies) {
    const sim = jaccardSimilarity(tokens, tokenizeForSimilarity(prev));
    if (sim > max) max = sim;
  }
  return max;
}

export function validateDraft(
  draft: PipelineDraft,
  opts: ValidateDraftOpts,
): ValidateDraftResult {
  const errors: string[] = [];
  const body = draft.body?.trim() ?? "";
  const title = draft.redditTitle?.trim() ?? draft.title.trim();

  if (!body) {
    errors.push("body is empty");
  }

  const forbidden = parseForbiddenWords();
  const haystack = `${title}\n${body}`.toLowerCase();
  for (const word of forbidden) {
    if (word && haystack.includes(word)) {
      errors.push(`forbidden phrase: ${word}`);
    }
  }

  if (draft.platform === "reddit") {
    if (title.length > 300) {
      errors.push(`reddit title exceeds 300 chars (${title.length})`);
    }
    if (body.length > 40_000) {
      errors.push(`reddit body exceeds 40000 chars (${body.length})`);
    }
  }

  if (draft.platform === "x") {
    const limit = xCharLimit();
    if (body.length > limit) {
      errors.push(`x body exceeds ${limit} chars (${body.length})`);
    }
  }

  if (body && opts.recentBodies.length > 0) {
    const sim = maxSimilarityToRecent(body, opts.recentBodies);
    const threshold = similarityMax();
    if (sim >= threshold) {
      errors.push(
        `body too similar to recent post (jaccard ${sim.toFixed(3)} >= ${threshold})`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}
