import type { IngestCandidate } from "../news/types";

export type Platform = "reddit" | "x";

export type DraftStatus =
  | "pending_mira"
  | "pending_approve"
  | "validated"
  | "rejected"
  | "published";

export interface PipelineDraft {
  id?: number;
  createdAt?: string;
  title: string;
  url: string;
  summary: string;
  publishedAt: Date;
  source: string;
  tags: string[];
  score: number;
  subreddit: string;
  postLang: "en";
  tier?: string;
  miraRawText?: string;
  body?: string;
  redditTitle?: string;
  platform: Platform;
  status: DraftStatus;
  errors: string[];
}

export function draftFromCandidate(
  candidate: IngestCandidate,
  platform: Platform = "reddit",
): PipelineDraft {
  return {
    title: candidate.title,
    url: candidate.url,
    summary: candidate.summary,
    publishedAt: candidate.publishedAt,
    source: candidate.source,
    tags: candidate.tags,
    score: candidate.score,
    subreddit: candidate.subreddit,
    postLang: candidate.postLang,
    tier: candidate.tier,
    platform,
    status: "pending_mira",
    errors: [],
  };
}

export interface PipelineCycleResult {
  draftId: number;
  draft: PipelineDraft;
  miraPrompt: string;
  needsMira: boolean;
}
