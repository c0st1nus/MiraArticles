import type { Database } from "bun:sqlite";
import { insertPublished, logError, updateDraftStatus } from "../pipeline/store";
import { markPublished } from "../news/dedup";
import { loadCredentials, refreshAccessToken } from "./reddit-auth";
import type { PublishResult, RedditSubmitInput } from "./types";
import type { PipelineDraft } from "../pipeline/types";

const REDDIT_API = "https://oauth.reddit.com/api/submit";

interface RedditSubmitResponse {
  json?: {
    errors?: Array<[string, string, string]>;
    data?: {
      id?: string;
      url?: string;
      name?: string;
    };
  };
}

/** Low-level submit — returns PublishResult. Inject fetchFn for tests. */
export async function submitSelfPost(
  input: RedditSubmitInput,
  opts?: { fetchFn?: typeof fetch },
): Promise<PublishResult> {
  const fetchFn = opts?.fetchFn ?? fetch;
  const creds = loadCredentials();
  const { accessToken } = await refreshAccessToken(creds, fetchFn);

  const body = new URLSearchParams({
    kind: input.kind ?? "self",
    sr: input.sr,
    title: input.title,
    text: input.text,
    resubmit: "false",
    sendreplies: "true",
  });

  const resp = await fetchFn(REDDIT_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": creds.userAgent,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const json = (await resp.json()) as RedditSubmitResponse;

  if (!resp.ok) {
    return { ok: false, error: `HTTP ${resp.status}: ${JSON.stringify(json)}` };
  }

  const errors = json?.json?.errors;
  if (errors && errors.length > 0) {
    return { ok: false, error: errors.map((e) => e[1]).join("; ") };
  }

  const postId = json?.json?.data?.name ?? json?.json?.data?.id;
  const postUrl =
    json?.json?.data?.url ??
    (postId ? `https://www.reddit.com/r/${input.sr}/comments/${postId?.replace(/^t3_/, "")}` : undefined);

  return { ok: true, postId, url: postUrl };
}

export interface PublishDraftOpts {
  fetchFn?: typeof fetch;
  /** Override subreddit (for smoke tests) */
  subredditOverride?: string;
}

/**
 * Full pipeline publish: validate guards, submit, record in DB, mark dedup.
 */
export async function publishDraftToReddit(
  db: Database,
  draft: PipelineDraft,
  opts?: PublishDraftOpts,
): Promise<PublishResult> {
  // Guard: feature flag
  if (process.env.REDDIT_ENABLED !== "true") {
    return { ok: true, skipped: true, error: "REDDIT_ENABLED is not true" };
  }

  // Guard: draft status
  // When HUMAN_APPROVE=true a human has reviewed the draft, so both
  // 'validated' (auto-approved) and 'pending_approve' (awaiting human sign-off
  // but allowed to post) are accepted. Without the flag only 'validated' passes.
  const humanApprove = process.env.HUMAN_APPROVE === "true";
  const allowedStatuses = humanApprove
    ? new Set(["validated", "pending_approve"])
    : new Set(["validated"]);
  if (!allowedStatuses.has(draft.status)) {
    return {
      ok: false,
      error: `Draft status is '${draft.status}', expected ${humanApprove ? "'validated' or 'pending_approve'" : "'validated'"}`,
    };
  }

  // Guard: required fields
  if (!draft.body) {
    return { ok: false, error: "Draft missing body" };
  }
  if (!draft.redditTitle) {
    return { ok: false, error: "Draft missing redditTitle" };
  }

  // Resolve subreddit (strip r/ prefix if present)
  const rawSr =
    opts?.subredditOverride ??
    process.env.REDDIT_TEST_SR ??
    draft.subreddit;
  const sr = rawSr.replace(/^r\//, "");

  // Guard: block r/programming unless explicitly allowed
  if (sr === "programming" && process.env.ALLOW_R_PROGRAMMING !== "true") {
    return { ok: false, error: "Subreddit 'programming' is blocked (set ALLOW_R_PROGRAMMING=true to override)" };
  }

  let result: PublishResult;
  try {
    result = await submitSelfPost(
      { sr, title: draft.redditTitle, text: draft.body },
      { fetchFn: opts?.fetchFn },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(db, "reddit-publish", msg, { draftId: draft.id, sr });
    return { ok: false, error: msg };
  }

  if (!result.ok) {
    logError(db, "reddit-publish", result.error ?? "unknown error", {
      draftId: draft.id,
      sr,
    });
    return result;
  }

  // Record success
  try {
    insertPublished(db, {
      draftId: draft.id,
      subreddit: sr,
      platform: "reddit",
      body: draft.body,
      // canonicalUrl = full Reddit permalink returned by the API (e.g. https://www.reddit.com/r/…/comments/…)
      canonicalUrl: result.url,
    });

    if (draft.id != null) {
      updateDraftStatus(db, draft.id, "published");
    }

    markPublished(draft.url);
  } catch (err) {
    // Log but don't fail — post already went through
    const msg = err instanceof Error ? err.message : String(err);
    logError(db, "reddit-publish-record", msg, { draftId: draft.id });
  }

  return result;
}
