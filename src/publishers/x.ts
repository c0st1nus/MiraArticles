import type { Database } from "bun:sqlite";
import crypto from "crypto";
import OAuth from "oauth-1.0a";
import { insertPublished, logError, updateDraftStatus } from "../pipeline/store";
import { markPublished } from "../news/dedup";
import type { PipelineDraft } from "../pipeline/types";
import { loadXCredentials } from "./x-auth";
import type { PublishResult } from "./types";

const X_TWEETS_API = "https://api.twitter.com/2/tweets";

interface XTweetResponse {
  data?: {
    id?: string;
    text?: string;
  };
  errors?: Array<{ message?: string; detail?: string }>;
  detail?: string;
  title?: string;
}

function createOAuthClient(creds: ReturnType<typeof loadXCredentials>): OAuth {
  return new OAuth({
    consumer: { key: creds.apiKey, secret: creds.apiSecret },
    signature_method: "HMAC-SHA1",
    hash_function(base, key) {
      return crypto.createHmac("sha1", key).update(base).digest("base64");
    },
  });
}

/** Low-level tweet POST — returns PublishResult. Inject fetchFn for tests. */
export async function postTweet(
  text: string,
  opts?: { fetchFn?: typeof fetch },
): Promise<PublishResult> {
  const fetchFn = opts?.fetchFn ?? fetch;
  const creds = loadXCredentials();
  const oauth = createOAuthClient(creds);

  const method = "POST";
  const auth = oauth.authorize(
    { url: X_TWEETS_API, method },
    { key: creds.accessToken, secret: creds.accessTokenSecret },
  );
  const header = oauth.toHeader(auth);

  const resp = await fetchFn(X_TWEETS_API, {
    method,
    headers: {
      ...header,
      "Content-Type": "application/json",
    } as HeadersInit,
    body: JSON.stringify({ text }),
  });

  const json = (await resp.json()) as XTweetResponse;

  if (!resp.ok) {
    const apiMsg =
      json.errors?.map((e) => e.message ?? e.detail).filter(Boolean).join("; ") ??
      json.detail ??
      json.title;
    return {
      ok: false,
      error: apiMsg
        ? `HTTP ${resp.status}: ${apiMsg}`
        : `HTTP ${resp.status}: ${JSON.stringify(json)}`,
    };
  }

  const postId = json.data?.id;
  if (!postId) {
    return { ok: false, error: `Unexpected X API response: ${JSON.stringify(json)}` };
  }

  return {
    ok: true,
    postId,
    url: `https://x.com/i/web/status/${postId}`,
  };
}

export interface PublishDraftOpts {
  fetchFn?: typeof fetch;
}

/**
 * Full pipeline publish: validate guards, post tweet, record in DB, mark dedup.
 */
export async function publishDraftToX(
  db: Database,
  draft: PipelineDraft,
  opts?: PublishDraftOpts,
): Promise<PublishResult> {
  if (process.env.X_ENABLED !== "true") {
    return { ok: true, skipped: true, error: "X_ENABLED is not true" };
  }

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

  if (draft.platform !== "x") {
    return { ok: false, error: `Draft platform is '${draft.platform}', expected 'x'` };
  }

  if (!draft.body) {
    return { ok: false, error: "Draft missing body" };
  }

  let result: PublishResult;
  try {
    result = await postTweet(draft.body, { fetchFn: opts?.fetchFn });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(db, "x-publish", msg, { draftId: draft.id });
    return { ok: false, error: msg };
  }

  if (!result.ok) {
    logError(db, "x-publish", result.error ?? "unknown error", {
      draftId: draft.id,
    });
    return result;
  }

  try {
    insertPublished(db, {
      draftId: draft.id,
      subreddit: "x",
      platform: "x",
      body: draft.body,
      canonicalUrl: result.url,
    });

    if (draft.id != null) {
      updateDraftStatus(db, draft.id, "published");
    }

    markPublished(draft.url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(db, "x-publish-record", msg, { draftId: draft.id });
  }

  return result;
}
