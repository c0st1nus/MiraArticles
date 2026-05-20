import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import { openDatabase, closeDatabase, insertDraft, getDraft, draftRowToPipelineDraft } from "../pipeline/store";
import type { Database } from "bun:sqlite";
import type { PipelineDraft } from "../pipeline/types";
import { clearFlairCache, publishDraftToReddit, submitSelfPost } from "./reddit";

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

const DEFAULT_LINUX_FLAIRS = [
  { id: "flair_news", text: "News" },
  { id: "flair_disc", text: "Discussion" },
];

function makeTokenFetch(
  tokenResp: object = { access_token: "mock_access_token", expires_in: 3600 },
  submitResp: object = {
    json: { errors: [], data: { id: "t3_abc123", name: "t3_abc123", url: "https://www.reddit.com/r/technology/comments/abc123" } },
  },
  flairResp: object = DEFAULT_LINUX_FLAIRS,
): typeof fetch {
  return async (input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("api/v1/access_token")) {
      return new Response(JSON.stringify(tokenResp), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("link_flair")) {
      return new Response(JSON.stringify(flairResp), { status: 200, headers: { "Content-Type": "application/json" } });
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

describe("submitSelfPost", () => {
  const originalEnv: Record<string, string | undefined> = {};

  function setEnv(vars: Record<string, string | undefined>) {
    for (const [k, v] of Object.entries(vars)) {
      originalEnv[k] = process.env[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  function restoreEnv() {
    for (const [k, v] of Object.entries(originalEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  beforeEach(() => {
    clearFlairCache();
    setEnv({
      REDDIT_REFRESH_TOKEN: "mock_refresh_token",
      REDDIT_CLIENT_ID: "test_client_id",
      REDDIT_USER_AGENT: "TestAgent/1.0",
    });
  });

  afterEach(() => {
    restoreEnv();
    clearFlairCache();
  });

  it("includes flair_id in submit body when set", async () => {
    let capturedBody = "";
    const fetchFn = makeTokenFetch();
    const customFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("api/submit")) {
        capturedBody = init?.body?.toString() ?? "";
        return new Response(
          JSON.stringify({
            json: { errors: [], data: { name: "t3_fl", url: "https://www.reddit.com/r/linux/comments/fl" } },
          }),
          { status: 200 },
        );
      }
      return fetchFn(input, init);
    };

    await submitSelfPost(
      { sr: "linux", title: "Title", text: "Body", flairId: "flair_news" },
      { fetchFn: customFetch },
    );
    const params = new URLSearchParams(capturedBody);
    expect(params.get("flair_id")).toBe("flair_news");
    expect(params.get("flair_text")).toBeNull();
  });

  it("sends api_type=json in submit request body", async () => {
    let capturedBody = "";
    const fetchFn = makeTokenFetch();
    const customFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("api/submit")) {
        capturedBody = init?.body?.toString() ?? "";
        return new Response(
          JSON.stringify({
            json: { errors: [], data: { name: "t3_abc", url: "https://www.reddit.com/r/technology/comments/abc" } },
          }),
          { status: 200 },
        );
      }
      return fetchFn(input, init);
    };

    await submitSelfPost({ sr: "technology", title: "Title", text: "Body" }, { fetchFn: customFetch });
    expect(new URLSearchParams(capturedBody).get("api_type")).toBe("json");
  });

  it("fails when response has only jquery without post id/url", async () => {
    const jqueryOnly = {
      jquery: [[0, 1, "call", ["body"], ["visibility", "hidden"]]],
    };
    const result = await submitSelfPost(
      { sr: "technology", title: "Title", text: "Body" },
      { fetchFn: makeTokenFetch({ access_token: "tok", expires_in: 3600 }, jqueryOnly) },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("no post id/url");
  });

  it("uses jquery redirect as url fallback when json data is missing", async () => {
    const redirect = "https://www.reddit.com/r/technology/comments/xyz789/title_slug/";
    const jqueryWithRedirect = {
      jquery: [[0, 1, "call", ["body"], ["redirect", [redirect]]]],
    };
    const result = await submitSelfPost(
      { sr: "technology", title: "Title", text: "Body" },
      { fetchFn: makeTokenFetch({ access_token: "tok", expires_in: 3600 }, jqueryWithRedirect) },
    );
    expect(result.ok).toBe(true);
    expect(result.url).toBe(redirect);
  });
});

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
    clearFlairCache();
    db = openDatabase(":memory:");
    setEnv({
      REDDIT_ENABLED: "true",
      REDDIT_REFRESH_TOKEN: "mock_refresh_token",
      REDDIT_CLIENT_ID: "test_client_id",
      REDDIT_USER_AGENT: "TestAgent/1.0",
      REDDIT_TEST_SR: undefined,
      REDDIT_FORCE_SR: undefined,
      REDDIT_DEFAULT_FLAIR_TEXT: undefined,
      ALLOW_R_PROGRAMMING: undefined,
      REDDIT_BLOCKED_SUBREDDITS: "",
      REDDIT_ALLOWED_SUBREDDITS: undefined,
      DISCLOSURE_ALWAYS_REF: undefined,
    });
  });

  afterEach(() => {
    closeDatabase();
    db.close();
    restoreEnv();
    clearFlairCache();
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

  it("blocks subreddit=technology when in REDDIT_BLOCKED_SUBREDDITS", async () => {
    process.env.REDDIT_BLOCKED_SUBREDDITS = "technology,netsec";
    const result = await publishDraftToReddit(
      db,
      makeDraft({ subreddit: "technology" }),
      { fetchFn: makeTokenFetch() },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("technology");
    expect(result.error).toContain("REDDIT_BLOCKED_SUBREDDITS");
  });

  it("blocks subreddit not in REDDIT_ALLOWED_SUBREDDITS", async () => {
    process.env.REDDIT_ALLOWED_SUBREDDITS = "linux,devops";
    const result = await publishDraftToReddit(
      db,
      makeDraft({ subreddit: "opensource" }),
      { fetchFn: makeTokenFetch() },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("REDDIT_ALLOWED_SUBREDDITS");
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
    const baseFetch = makeTokenFetch();
    const customFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("api/submit")) {
        const params = new URLSearchParams(init?.body?.toString() ?? "");
        capturedSr = params.get("sr") ?? "";
      }
      return baseFetch(input, init);
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

  it("ignores REDDIT_TEST_SR env and uses draft subreddit", async () => {
    process.env.REDDIT_TEST_SR = "u_testuser";
    let capturedSr = "";
    const baseFetch = makeTokenFetch();
    const customFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("api/submit")) {
        const params = new URLSearchParams(init?.body?.toString() ?? "");
        capturedSr = params.get("sr") ?? "";
      }
      return baseFetch(input, init);
    };

    await publishDraftToReddit(db, makeDraft({ subreddit: "technology" }), { fetchFn: customFetch });
    expect(capturedSr).toBe("technology");

    delete process.env.REDDIT_TEST_SR;
  });

  it("publishes to linux with flair_id from link_flair_v2 and yaml default", async () => {
    let capturedBody = "";
    const fetchFn = makeTokenFetch(
      { access_token: "tok", expires_in: 3600 },
      {
        json: {
          errors: [],
          data: { name: "t3_linux1", url: "https://www.reddit.com/r/linux/comments/linux1" },
        },
      },
      DEFAULT_LINUX_FLAIRS,
    );
    const customFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("api/submit")) {
        capturedBody = init?.body?.toString() ?? "";
      }
      return fetchFn(input, init);
    };

    const draftId = insertDraft(db, {
      status: "validated",
      subreddit: "linux",
      platform: "reddit",
      news: {
        title: "t",
        url: "https://example.com/linux-post",
        summary: "s",
        publishedAt: new Date().toISOString(),
        source: "ex",
        tags: [],
        score: 0,
      },
      body: "linux body",
      redditTitle: "Linux news title",
    });
    const draft = draftRowToPipelineDraft(getDraft(db, draftId)!);

    const result = await publishDraftToReddit(db, draft, { fetchFn: customFetch });
    expect(result.ok).toBe(true);
    const params = new URLSearchParams(capturedBody);
    expect(params.get("sr")).toBe("linux");
    expect(params.get("flair_id")).toBe("flair_news");
  });

  it("uses REDDIT_FORCE_SR over draft subreddit (profile, no flair fetch)", async () => {
    process.env.REDDIT_FORCE_SR = "u_c0s1nu7";
    let capturedSr = "";
    let flairRequested = false;
    const customFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("access_token")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
      }
      if (url.includes("link_flair")) {
        flairRequested = true;
        return new Response(JSON.stringify([]), { status: 200 });
      }
      const params = new URLSearchParams(init?.body?.toString() ?? "");
      capturedSr = params.get("sr") ?? "";
      return new Response(
        JSON.stringify({
          json: { errors: [], data: { name: "t3_prof", url: "https://reddit.com/user/c0s1nu7/comments/prof" } },
        }),
        { status: 200 },
      );
    };

    await publishDraftToReddit(db, makeDraft({ subreddit: "linux" }), { fetchFn: customFetch });
    expect(capturedSr).toBe("u_c0s1nu7");
    expect(flairRequested).toBe(false);
    delete process.env.REDDIT_FORCE_SR;
  });

  it("uses subredditOverride when passed", async () => {
    let capturedSr = "";
    const customFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("access_token")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
      }
      const params = new URLSearchParams(init?.body?.toString() ?? "");
      capturedSr = params.get("sr") ?? "";
      return new Response(
        JSON.stringify({
          json: { errors: [], data: { name: "t3_1", url: "https://reddit.com/r/u_testuser/comments/1" } },
        }),
        { status: 200 },
      );
    };

    await publishDraftToReddit(db, makeDraft({ subreddit: "technology" }), {
      fetchFn: customFetch,
      subredditOverride: "u_testuser",
    });
    expect(capturedSr).toBe("u_testuser");
  });

  it("does not mark draft published when submit returns ok without post id/url", async () => {
    const jqueryOnly = { jquery: [[0, 1, "call", ["body"], ["html", {}]]] };
    const draftId = insertDraft(db, {
      status: "validated",
      subreddit: "technology",
      platform: "reddit",
      news: { title: "t", url: "https://example.com/c", summary: "s", publishedAt: new Date().toISOString(), source: "ex", tags: [], score: 0 },
      body: "body",
      redditTitle: "title",
    });
    const draft = draftRowToPipelineDraft(getDraft(db, draftId)!);

    const result = await publishDraftToReddit(db, draft, {
      fetchFn: makeTokenFetch({ access_token: "tok", expires_in: 3600 }, jqueryOnly),
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("no post id/url");
    expect(getDraft(db, draftId)!.status).toBe("validated");
    const pubRow = db.prepare("SELECT * FROM published WHERE draft_id = ?").get(draftId);
    expect(pubRow).toBeNull();
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
