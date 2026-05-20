import type { Database } from "bun:sqlite";
import { createMiraClient, sendPromptToMira } from "../mira/client";
import type { IngestCandidate } from "../news/types";
import { finalizeDraftAfterMira } from "../pipeline/finalize-mira";
import { runPipelineCycle } from "../pipeline/run-cycle";
import {
  getDatabase,
  logError,
  resetDatabase,
} from "../pipeline/store";
import type { PipelineDraft, Platform } from "../pipeline/types";
import { publishDraftToReddit } from "../publishers/reddit";
import { publishDraftToX } from "../publishers/x";
import type { PublishResult } from "../publishers/types";

export type CyclePlatform = "reddit" | "x" | "both";

export interface RunFullCycleOpts {
  skipMira?: boolean;
  skipPublish?: boolean;
  platform?: CyclePlatform;
  dbPath?: string;
  dryRun?: boolean;
  /** Offline tests / smoke — bypass ingest */
  candidate?: IngestCandidate;
  miraText?: string;
  fetchFn?: typeof fetch;
}

export interface RunFullCycleResult {
  ok: boolean;
  reason?: string;
  draftId?: number;
  published?: boolean;
  draftStatus?: string;
  reddit?: PublishResult;
  /** Flattened from reddit.url when publish succeeds */
  redditUrl?: string;
  /** Flattened from reddit.postId when publish succeeds */
  redditPostId?: string;
  x?: PublishResult;
  errors?: string[];
}

function withRedditPublishFields(
  result: RunFullCycleResult,
  reddit?: PublishResult,
): RunFullCycleResult {
  if (!reddit?.url && !reddit?.postId) return result;
  return {
    ...result,
    ...(reddit.url ? { redditUrl: reddit.url } : {}),
    ...(reddit.postId ? { redditPostId: reddit.postId } : {}),
  };
}

function resolveSkipMira(opts?: RunFullCycleOpts): boolean {
  if (opts?.skipMira !== undefined) return opts.skipMira;
  return process.env.PIPELINE_SKIP_MIRA === "true";
}

function pipelinePlatform(cyclePlatform: CyclePlatform): Platform {
  return cyclePlatform === "x" ? "x" : "reddit";
}

function candidateMetaFromDraft(draft: PipelineDraft): {
  title: string;
  url: string;
  subreddit: string;
  platform: Platform;
  postLang: "en";
} {
  return {
    title: draft.title,
    url: draft.url,
    subreddit: draft.subreddit,
    platform: draft.platform,
    postLang: draft.postLang,
  };
}

async function disconnectMira(client: Awaited<ReturnType<typeof createMiraClient>>): Promise<void> {
  try {
    await client.disconnect();
  } catch {
    // ignore teardown errors
  }
}

export async function runFullCycle(opts?: RunFullCycleOpts): Promise<RunFullCycleResult> {
  const skipMira = resolveSkipMira(opts);
  const skipPublish = opts?.skipPublish === true || opts?.dryRun === true;
  const cyclePlatform = opts?.platform ?? "reddit";
  const pipelinePlat = pipelinePlatform(cyclePlatform);

  if (opts?.dbPath) {
    resetDatabase(opts.dbPath);
  }
  let db: Database = getDatabase();

  try {
    const cycle = await runPipelineCycle({
      skipMira,
      platform: pipelinePlat,
      dbPath: opts?.dbPath,
      candidate: opts?.candidate,
      miraText: opts?.miraText,
    });
    db = getDatabase();

    if (!cycle) {
      return { ok: false, reason: "no_candidate" };
    }

    let draft = cycle.draft;
    const draftId = cycle.draftId;
    const meta = candidateMetaFromDraft(draft);

    if (cycle.needsMira && !skipMira) {
      let client: Awaited<ReturnType<typeof createMiraClient>> | null = null;
      try {
        client = await createMiraClient();
        const miraResult = await sendPromptToMira(client, cycle.miraPrompt);
        draft = finalizeDraftAfterMira(db, draftId, miraResult.draftText, meta);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logError(db, "mira", message, { draftId });
        return { ok: false, reason: "mira_failed", draftId, errors: [message] };
      } finally {
        if (client) await disconnectMira(client);
      }
    } else if (!cycle.needsMira) {
      draft = cycle.draft;
    }

    if (draft.status === "rejected") {
      return {
        ok: false,
        reason: "rejected",
        draftId,
        draftStatus: draft.status,
        errors: draft.errors,
      };
    }

    if (draft.status === "pending_approve" && process.env.HUMAN_APPROVE === "true") {
      return {
        ok: true,
        draftId,
        published: false,
        draftStatus: draft.status,
      };
    }

    if (skipPublish) {
      return {
        ok: true,
        draftId,
        published: false,
        draftStatus: draft.status,
      };
    }

    const errors: string[] = [];
    let redditResult: PublishResult | undefined;
    let xResult: PublishResult | undefined;

    if (cyclePlatform === "reddit" || cyclePlatform === "both") {
      redditResult = await publishDraftToReddit(db, draft, { fetchFn: opts?.fetchFn });
      if (!redditResult.ok && !redditResult.skipped) {
        errors.push(redditResult.error ?? "reddit publish failed");
      }
    }

    if (
      (cyclePlatform === "x" || cyclePlatform === "both") &&
      process.env.X_ENABLED === "true"
    ) {
      const xDraft: PipelineDraft =
        draft.platform === "x" ? draft : { ...draft, platform: "x" };
      xResult = await publishDraftToX(db, xDraft, { fetchFn: opts?.fetchFn });
      if (!xResult.ok && !xResult.skipped) {
        errors.push(xResult.error ?? "x publish failed");
      }
    }

    const redditOk = !redditResult || redditResult.ok || redditResult.skipped;
    const xOk = !xResult || xResult.ok || xResult.skipped;
    const published =
      (redditResult?.ok && !redditResult.skipped) || (xResult?.ok && !xResult.skipped);

    if (!redditOk || !xOk) {
      return withRedditPublishFields(
        {
          ok: false,
          reason: "publish_failed",
          draftId,
          draftStatus: draft.status,
          reddit: redditResult,
          x: xResult,
          errors: errors.length ? errors : undefined,
          published: false,
        },
        redditResult,
      );
    }

    return withRedditPublishFields(
      {
        ok: true,
        draftId,
        published,
        draftStatus: draft.status,
        reddit: redditResult,
        x: xResult,
      },
      redditResult,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError(db, "orchestrator", message);
    return { ok: false, reason: "orchestrator_error", errors: [message] };
  }
}
