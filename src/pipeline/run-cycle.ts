import { cleanDraftText } from "../mira/parser";
import { runIngestCycle, type IngestCandidate } from "../news/index";
import { applyDisclosure } from "./disclosure";
import { buildMiraPrompt } from "./prompt";
import {
  closeDatabase,
  draftRowToPipelineDraft,
  getDatabase,
  resetDatabase,
  insertDraft,
  listRecentPublishedBodies,
  logError,
  newsSnapshotFromDraft,
} from "./store";
import {
  draftFromCandidate,
  type PipelineCycleResult,
  type PipelineDraft,
  type Platform,
} from "./types";
import { validateDraft } from "./validator";

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

function redditTitleFromCandidate(title: string): string {
  const t = title.trim();
  return t.length <= 300 ? t : `${t.slice(0, 297)}...`;
}

function finalizeStatus(
  validationOk: boolean,
): "pending_approve" | "validated" | "rejected" {
  if (!validationOk) return "rejected";
  if (process.env.HUMAN_APPROVE === "true") return "pending_approve";
  return "validated";
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
    const miraRawText = cleanDraftText(rawMira);
    const body = applyDisclosure(miraRawText, {
      sourceUrl: candidate.url,
      subreddit: candidate.subreddit,
      platform,
      postLang: candidate.postLang,
    });

    draft.miraRawText = miraRawText;
    draft.body = body;
    draft.redditTitle = redditTitleFromCandidate(candidate.title);

    const recentBodies = listRecentPublishedBodies(db);
    const validation = validateDraft(draft, { recentBodies });
    draft.errors = validation.errors;
    draft.status = finalizeStatus(validation.ok);

    const draftId = insertDraft(db, {
      status: draft.status,
      subreddit: candidate.subreddit,
      platform,
      news: newsSnapshotFromDraft(draft),
      miraRaw: miraRawText,
      body,
      redditTitle: draft.redditTitle,
      validationErrors: validation.errors,
    });
    draft.id = draftId;

    if (!validation.ok) {
      logError(db, "validate", validation.errors.join("; "), {
        draftId,
        subreddit: candidate.subreddit,
      });
    }

    return { draftId, draft, miraPrompt, needsMira: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError(db, "run-cycle", message);
    throw err;
  }
}

