import type { Database } from "bun:sqlite";
import { cleanDraftText } from "../mira/parser";
import { applyDisclosure } from "./disclosure";
import {
  draftRowToPipelineDraft,
  getDraft,
  listRecentPublishedBodies,
  logError,
  updateDraft,
} from "./store";
import type { PipelineDraft, Platform } from "./types";
import { validateDraft } from "./validator";

export interface CandidateMeta {
  title: string;
  url: string;
  subreddit: string;
  platform: Platform;
  postLang: "en";
}

export function redditTitleFromCandidate(title: string): string {
  const t = title.trim();
  return t.length <= 300 ? t : `${t.slice(0, 297)}...`;
}

export function finalizeStatus(
  validationOk: boolean,
): "pending_approve" | "validated" | "rejected" {
  if (!validationOk) return "rejected";
  if (process.env.HUMAN_APPROVE === "true") return "pending_approve";
  return "validated";
}

export function finalizeDraftAfterMira(
  db: Database,
  draftId: number,
  miraRawText: string,
  candidateMeta: CandidateMeta,
): PipelineDraft {
  const row = getDraft(db, draftId);
  if (!row) {
    throw new Error(`draft ${draftId} not found`);
  }

  const cleaned = cleanDraftText(miraRawText);
  const body = applyDisclosure(cleaned, {
    sourceUrl: candidateMeta.url,
    subreddit: candidateMeta.subreddit,
    platform: candidateMeta.platform,
    postLang: candidateMeta.postLang,
  });
  const redditTitle = redditTitleFromCandidate(candidateMeta.title);

  const base = draftRowToPipelineDraft(row);
  let draft: PipelineDraft = {
    ...base,
    miraRawText: cleaned,
    body,
    redditTitle,
  };

  const recentBodies = listRecentPublishedBodies(db);
  const validation = validateDraft(draft, { recentBodies });
  draft.errors = validation.errors;
  draft.status = finalizeStatus(validation.ok);

  updateDraft(db, draftId, {
    status: draft.status,
    miraRaw: cleaned,
    body,
    redditTitle,
    validationErrors: validation.errors,
  });
  draft.id = draftId;

  if (!validation.ok) {
    logError(db, "validate", validation.errors.join("; "), {
      draftId,
      subreddit: candidateMeta.subreddit,
    });
  }

  return draft;
}
