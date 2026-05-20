import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import type { Database } from "bun:sqlite";
import {
  openDatabase,
  closeDatabase,
  insertDraft,
  getDraft,
  draftRowToPipelineDraft,
} from "../pipeline/store";
import type { PipelineDraft } from "../pipeline/types";
import { publishDraftToX } from "./x";

function makeDraft(overrides: Partial<PipelineDraft> = {}): PipelineDraft {
  return {
    title: "Test Article Title",
    url: "https://example.com/test-article",
    summary: "A test article summary.",
    publishedAt: new Date("2026-01-01T00:00:00Z"),
    source: "example.com",
    tags: ["technology"],
    score: 0.8,
    subreddit: "technology",
    postLang: "en",
    platform: "x",
    status: "validated",
    body: "Short tweet body for X.",
    errors: [],
    ...overrides,
  };
}

function makeTweetFetch(
  tweetResp: object = {
    data: { id: "1234567890", text: "Short tweet body for X." },
  },
  status = 201,
): typeof fetch {
  return async (input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/2/tweets")) {
      return new Response(JSON.stringify(tweetResp), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
}

describe("publishDraftToX", () => {
  let db: Database;
  const originalEnv: Record<string, string | undefined> = {};

  function setEnv(vars: Record<string, string | undefined>) {
    for (const [k, v] of Object.entries(vars)) {
      originalEnv[k] = process.env[k];
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }

  function restoreEnv() {
    for (const [k, v] of Object.entries(originalEnv)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }

  beforeEach(() => {
    db = openDatabase(":memory:");
    setEnv({
      X_ENABLED: "true",
      X_API_KEY: "test_api_key",
      X_API_SECRET: "test_api_secret",
      X_ACCESS_TOKEN: "test_access_token",
      X_ACCESS_TOKEN_SECRET: "test_access_secret",
    });
  });

  afterEach(() => {
    closeDatabase();
    db.close();
    restoreEnv();
  });

  it("returns skipped when X_ENABLED is not true", async () => {
    process.env.X_ENABLED = "false";
    const result = await publishDraftToX(db, makeDraft());
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.error).toContain("X_ENABLED");
  });

  it("rejects draft with status != validated (pending_mira)", async () => {
    const result = await publishDraftToX(db, makeDraft({ status: "pending_mira" }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("pending_mira");
  });

  it("rejects draft with missing body", async () => {
    const result = await publishDraftToX(db, makeDraft({ body: undefined }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("body");
  });

  it("rejects draft with platform !== x", async () => {
    const result = await publishDraftToX(
      db,
      makeDraft({ platform: "reddit" }),
      { fetchFn: makeTweetFetch() },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("platform");
    expect(result.error).toContain("'reddit'");
  });

  it("rejects pending_approve when HUMAN_APPROVE=false", async () => {
    process.env.HUMAN_APPROVE = "false";
    const result = await publishDraftToX(db, makeDraft({ status: "pending_approve" }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("pending_approve");
  });

  it("accepts pending_approve when HUMAN_APPROVE=true", async () => {
    process.env.HUMAN_APPROVE = "true";
    const draftId = insertDraft(db, {
      status: "pending_approve",
      subreddit: "technology",
      platform: "x",
      news: {
        title: "t",
        url: "https://example.com/ha",
        summary: "s",
        publishedAt: new Date().toISOString(),
        source: "ex",
        tags: [],
        score: 0,
      },
      body: "tweet body",
    });
    const draft = draftRowToPipelineDraft(getDraft(db, draftId)!);
    const result = await publishDraftToX(db, draft, { fetchFn: makeTweetFetch() });
    expect(result.ok).toBe(true);
    expect(result.postId).toBe("1234567890");
  });

  it("successful publish records in published table and updates draft status", async () => {
    const draftId = insertDraft(db, {
      status: "validated",
      subreddit: "technology",
      platform: "x",
      news: {
        title: "t",
        url: "https://example.com/article",
        summary: "s",
        publishedAt: new Date().toISOString(),
        source: "ex",
        tags: [],
        score: 0,
      },
      body: "tweet body content",
    });
    const draft = draftRowToPipelineDraft(getDraft(db, draftId)!);

    const result = await publishDraftToX(db, draft, { fetchFn: makeTweetFetch() });

    expect(result.ok).toBe(true);
    expect(result.postId).toBe("1234567890");
    expect(result.url).toBe("https://x.com/i/web/status/1234567890");

    const updatedRow = getDraft(db, draftId)!;
    expect(updatedRow.status).toBe("published");

    const pubRow = db
      .prepare("SELECT * FROM published WHERE draft_id = ?")
      .get(draftId) as { subreddit: string; platform: string } | null;
    expect(pubRow).toBeTruthy();
    expect(pubRow!.subreddit).toBe("x");
    expect(pubRow!.platform).toBe("x");
  });

  it("logs error and returns failure when X API returns error JSON", async () => {
    const errorFetch = makeTweetFetch(
      {
        errors: [{ message: "Credits required", detail: "Purchase credits" }],
        title: "Credits Required",
      },
      402,
    );

    const draftId = insertDraft(db, {
      status: "validated",
      subreddit: "technology",
      platform: "x",
      news: {
        title: "t",
        url: "https://example.com/b",
        summary: "s",
        publishedAt: new Date().toISOString(),
        source: "ex",
        tags: [],
        score: 0,
      },
      body: "tweet body",
    });
    const draft = draftRowToPipelineDraft(getDraft(db, draftId)!);

    const result = await publishDraftToX(db, draft, { fetchFn: errorFetch });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("402");

    const errRow = db
      .prepare("SELECT * FROM errors WHERE stage = 'x-publish'")
      .get() as { message: string } | null;
    expect(errRow).toBeTruthy();
  });
});

describe("loadXCredentials", () => {
  const originalEnv: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const [k, v] of Object.entries(originalEnv)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  });

  it("loads credentials from env vars", async () => {
    const { loadXCredentials } = await import("./x-auth");
    originalEnv.X_API_KEY = process.env.X_API_KEY;
    originalEnv.X_API_SECRET = process.env.X_API_SECRET;
    originalEnv.X_ACCESS_TOKEN = process.env.X_ACCESS_TOKEN;
    originalEnv.X_ACCESS_TOKEN_SECRET = process.env.X_ACCESS_TOKEN_SECRET;

    process.env.X_API_KEY = "key";
    process.env.X_API_SECRET = "secret";
    process.env.X_ACCESS_TOKEN = "token";
    process.env.X_ACCESS_TOKEN_SECRET = "token_secret";

    const creds = loadXCredentials();
    expect(creds.apiKey).toBe("key");
    expect(creds.accessToken).toBe("token");
  });
});
