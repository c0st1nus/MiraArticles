import { runIngestCycle, type IngestCandidate } from "../news/index";
import { finalizeDraftAfterMira, redditTitleFromCandidate } from "./finalize-mira";
import { buildMiraPrompt } from "./prompt";
import {
  getDatabase,
  resetDatabase,
  insertDraft,
  logError,
  newsSnapshotFromDraft,
} from "./store";
import {
  draftFromCandidate,
  type PipelineCycleResult,
  type PipelineDraft,
  type Platform,
} from "./types";

const DRY_RUN_STUB = `[DRY RUN] Stub draft for pipeline testing.
Summarize the news in your own words without adding links or disclaimers.`;

export interface RunPipelineCycleOpts {
  skipMira?: boolean;
  miraText?: string;
  platform?: Platform;
  dbPath?: string;
  /** Bypass ingest (offline tests / smoke script). */
  candidate?: IngestCandidate;
}

function resolveSkipMira(opts?: RunPipelineCycleOpts): boolean {
  if (opts?.skipMira !== undefined) return opts.skipMira;
  return process.env.PIPELINE_SKIP_MIRA === "true";
}

export async function runPipelineCycle(
  opts?: RunPipelineCycleOpts,
): Promise<PipelineCycleResult | null> {
  const platform = opts?.platform ?? "reddit";
  const skipMira = resolveSkipMira(opts);

  const db = opts?.dbPath ? resetDatabase(opts.dbPath) : getDatabase();

  try {
    const candidate =
      opts?.candidate ?? (await runIngestCycle()).candidate ?? null;
    if (!candidate) {
      return null;
    }
    let draft = draftFromCandidate(candidate, platform);
    const miraPrompt = buildMiraPrompt(candidate, {
      platform,
      subreddit: candidate.subreddit,
    });

    if (!skipMira) {
      const draftId = insertDraft(db, {
        status: "pending_mira",
        subreddit: candidate.subreddit,
        platform,
        news: newsSnapshotFromDraft(draft),
        redditTitle: redditTitleFromCandidate(candidate.title),
      });
      draft = { ...draft, id: draftId, status: "pending_mira" };
      return { draftId, draft, miraPrompt, needsMira: true };
    }

    const rawMira = opts?.miraText ?? DRY_RUN_STUB;
    const draftId = insertDraft(db, {
      status: "pending_mira",
      subreddit: candidate.subreddit,
      platform,
      news: newsSnapshotFromDraft(draft),
      redditTitle: redditTitleFromCandidate(candidate.title),
    });
    draft = finalizeDraftAfterMira(db, draftId, rawMira, {
      title: candidate.title,
      url: candidate.url,
      subreddit: candidate.subreddit,
      platform,
      postLang: candidate.postLang,
    });

    return { draftId, draft, miraPrompt, needsMira: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError(db, "run-cycle", message);
    throw err;
  }
}

