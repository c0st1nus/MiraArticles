import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import { openDatabase, closeDatabase, insertDraft, getDraft, draftRowToPipelineDraft } from "../pipeline/store";
import type { Database } from "bun:sqlite";
import type { PipelineDraft } from "../pipeline/types";
import { publishDraftToReddit } from "./reddit";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    platform: "reddit",
    status: "validated",
    body: "This is the body of the Reddit post. It has some useful content.",
    redditTitle: "Test Reddit Title",
    errors: [],
    ...overrides,
  };
}

function makeTokenFetch(
  tokenResp: object = { access_token: "mock_access_token", expires_in: 3600 },
  submitResp: object = {
    json: { errors: [], data: { id: "t3_abc123", name: "t3_abc123", url: "https://www.reddit.com/r/technology/comments/abc123" } },
  },
): typeof fetch {
  let callCount = 0;
  return async (input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    callCount++;
    if (url.includes("api/v1/access_token")) {
      return new Response(JSON.stringify(tokenResp), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("api/submit")) {
      return new Response(JSON.stringify(submitResp), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("publishDraftToReddit", () => {
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
      REDDIT_ENABLED: "true",
      REDDIT_REFRESH_TOKEN: "mock_refresh_token",
      REDDIT_CLIENT_ID: "test_client_id",
      REDDIT_USER_AGENT: "TestAgent/1.0",
      REDDIT_TEST_SR: undefined,
      ALLOW_R_PROGRAMMING: undefined,
    });
  });

  afterEach(() => {
    closeDatabase();
    db.close();
    restoreEnv();
  });

  it("returns skipped when REDDIT_ENABLED is not true", async () => {
    process.env.REDDIT_ENABLED = "false";
    const result = await publishDraftToReddit(db, makeDraft());
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
  });

  it("rejects draft with status != validated (pending_mira)", async () => {
    const result = await publishDraftToReddit(db, makeDraft({ status: "pending_mira" }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("pending_mira");
  });

  it("rejects draft with status != validated (rejected)", async () => {
    const result = await publishDraftToReddit(db, makeDraft({ status: "rejected" }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("rejected");
  });

  it("rejects draft with missing body", async () => {
    const result = await publishDraftToReddit(db, makeDraft({ body: undefined }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("body");
  });

  it("rejects draft with missing redditTitle", async () => {
    const result = await publishDraftToReddit(db, makeDraft({ redditTitle: undefined }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("redditTitle");
  });

  it("rejects pending_approve when HUMAN_APPROVE=false", async () => {
    process.env.HUMAN_APPROVE = "false";
    const result = await publishDraftToReddit(db, makeDraft({ status: "pending_approve" }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("pending_approve");
    expect(result.error).toContain("'validated'");
  });

  it("accepts pending_approve when HUMAN_APPROVE=true", async () => {
    process.env.HUMAN_APPROVE = "true";
    const draftId = insertDraft(db, {
      status: "pending_approve",
      subreddit: "technology",
      platform: "reddit",
      news: { title: "t", url: "https://example.com/ha", summary: "s", publishedAt: new Date().toISOString(), source: "ex", tags: [], score: 0 },
      body: "body text",
      redditTitle: "reddit title",
    });
    const draft = draftRowToPipelineDraft(getDraft(db, draftId)!);
    const result = await publishDraftToReddit(db, draft, { fetchFn: makeTokenFetch() });
    expect(result.ok).toBe(true);
    delete process.env.HUMAN_APPROVE;
  });

  it("blocks subreddit=programming without ALLOW_R_PROGRAMMING", async () => {
    const result = await publishDraftToReddit(
      db,
      makeDraft({ subreddit: "programming" }),
      { fetchFn: makeTokenFetch() },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("programming");
  });

  it("allows subreddit=programming when ALLOW_R_PROGRAMMING=true", async () => {
    process.env.ALLOW_R_PROGRAMMING = "true";
    const draftId = insertDraft(db, {
      status: "validated",
      subreddit: "programming",
      platform: "reddit",
      news: { title: "t", url: "https://example.com/a", summary: "s", publishedAt: new Date().toISOString(), source: "ex", tags: [], score: 0 },
      body: "body text",
      redditTitle: "reddit title",
    });
    const row = getDraft(db, draftId)!;
    const draft = draftRowToPipelineDraft(row);

    const result = await publishDraftToReddit(db, draft, { fetchFn: makeTokenFetch() });
    expect(result.ok).toBe(true);
    expect(result.postId).toBe("t3_abc123");
  });

  it("strips r/ prefix from subreddit", async () => {
    let capturedSr = "";
    const customFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("api/v1/access_token")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
      }
      const body = init?.body?.toString() ?? "";
      const params = new URLSearchParams(body);
      capturedSr = params.get("sr") ?? "";
      return new Response(JSON.stringify({
        json: { errors: [], data: { name: "t3_xyz", url: "https://reddit.com/r/technology/comments/xyz" } },
      }), { status: 200 });
    };

    await publishDraftToReddit(db, makeDraft({ subreddit: "r/technology" }), { fetchFn: customFetch });
    expect(capturedSr).toBe("technology");
  });

  it("successful publish records in published table and updates draft status", async () => {
    const draftId = insertDraft(db, {
      status: "validated",
      subreddit: "technology",
      platform: "reddit",
      news: { title: "t", url: "https://example.com/article", summary: "s", publishedAt: new Date().toISOString(), source: "ex", tags: [], score: 0 },
      body: "body text content",
      redditTitle: "Reddit Post Title",
    });
    const row = getDraft(db, draftId)!;
    const draft = draftRowToPipelineDraft(row);

    const result = await publishDraftToReddit(db, draft, { fetchFn: makeTokenFetch() });

    expect(result.ok).toBe(true);
    expect(result.postId).toBe("t3_abc123");

    // Draft status updated
    const updatedRow = getDraft(db, draftId)!;
    expect(updatedRow.status).toBe("published");

    // Published row inserted
    const pubRow = db.prepare("SELECT * FROM published WHERE draft_id = ?").get(draftId) as { subreddit: string; platform: string } | null;
    expect(pubRow).toBeTruthy();
    expect(pubRow!.subreddit).toBe("technology");
    expect(pubRow!.platform).toBe("reddit");
  });

  it("logs error and returns failure when Reddit API returns errors array", async () => {
    const errorFetch = makeTokenFetch(
      { access_token: "tok", expires_in: 3600 },
      { json: { errors: [["SUBREDDIT_NOTALLOWED", "you are not allowed to post here", "sr"]], data: null } },
    );

    const draftId = insertDraft(db, {
      status: "validated",
      subreddit: "technology",
      platform: "reddit",
      news: { title: "t", url: "https://example.com/b", summary: "s", publishedAt: new Date().toISOString(), source: "ex", tags: [], score: 0 },
      body: "body",
      redditTitle: "title",
    });
    const draft = draftRowToPipelineDraft(getDraft(db, draftId)!);

    const result = await publishDraftToReddit(db, draft, { fetchFn: errorFetch });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not allowed");

    const errRow = db.prepare("SELECT * FROM errors WHERE stage = 'reddit-publish'").get() as { message: string } | null;
    expect(errRow).toBeTruthy();
  });

  it("uses REDDIT_TEST_SR override from env", async () => {
    process.env.REDDIT_TEST_SR = "u_testuser";
    let capturedSr = "";
    const customFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("access_token")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
      }
      const params = new URLSearchParams(init?.body?.toString() ?? "");
      capturedSr = params.get("sr") ?? "";
      return new Response(JSON.stringify({ json: { errors: [], data: { name: "t3_1", url: "https://reddit.com/r/u_testuser/comments/1" } } }), { status: 200 });
    };

    await publishDraftToReddit(db, makeDraft(), { fetchFn: customFetch });
    expect(capturedSr).toBe("u_testuser");

    delete process.env.REDDIT_TEST_SR;
  });
});

// ---------------------------------------------------------------------------
// reddit-auth unit tests
// ---------------------------------------------------------------------------
describe("refreshAccessToken", () => {
  it("calls the correct endpoint and returns accessToken", async () => {
    const { refreshAccessToken, loadCredentials } = await import("./reddit-auth");

    const mockFetch: typeof fetch = async (_input, _init) => {
      return new Response(
        JSON.stringify({ access_token: "fresh_token", expires_in: 3600 }),
        { status: 200 },
      );
    };

    // Use a direct creds object — no file needed
    const creds = {
      clientId: "test_id",
      refreshToken: "test_refresh",
      userAgent: "TestAgent/1.0",
    };

    const result = await refreshAccessToken(creds, mockFetch);
    expect(result.accessToken).toBe("fresh_token");
    expect(result.expiresIn).toBe(3600);
  });

  it("throws on non-ok response", async () => {
    const { refreshAccessToken } = await import("./reddit-auth");

    const badFetch: typeof fetch = async () => {
      return new Response("Unauthorized", { status: 401 });
    };

    const creds = { clientId: "id", refreshToken: "rt", userAgent: "UA/1.0" };
    await expect(refreshAccessToken(creds, badFetch)).rejects.toThrow("401");
  });
});
