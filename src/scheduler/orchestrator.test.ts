import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
import { join } from "path";
import { projectDataDir } from "../config/load";
import type { IngestCandidate } from "../news/types";
import * as runCycle from "../pipeline/run-cycle";
import { runFullCycle } from "./orchestrator";

const fakeCandidate: IngestCandidate = {
  title: "Pipeline offline smoke: homelab backup tool 2.0",
  url: "https://example.com/selfhosted-backup",
  summary: "A self-hosted backup utility adds restic integration and scheduling.",
  publishedAt: new Date(),
  source: "pipeline-test",
  tags: ["selfhosted"],
  score: 50,
  subreddit: "selfhosted",
  postLang: "en",
};

const fakeMira = `Self-hosted backup tools keep maturing: the new release adds restic integration and sensible scheduling defaults for homelab users who want reliable off-site copies without a SaaS bill.

Worth a look if you run your own stack and outgrew ad-hoc rsync scripts.`;

function makeTokenFetch(): typeof fetch {
  return async (input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("api/v1/access_token")) {
      return new Response(JSON.stringify({ access_token: "mock", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("link_flair")) {
      return new Response(
        JSON.stringify([
          { id: "flair-release", text: "Release (No AI)" },
          { id: "flair-guide", text: "Guide" },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("api/submit")) {
      return new Response(
        JSON.stringify({
          json: {
            errors: [],
            data: { id: "t3_abc", name: "t3_abc", url: "https://www.reddit.com/r/selfhosted/comments/abc" },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
}

describe("runFullCycle", () => {
  const originalEnv: Record<string, string | undefined> = {};
  let dbPath: string;

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
    dbPath = join(projectDataDir(), `orchestrator-test-${Date.now()}.db`);
    setEnv({
      REDDIT_ENABLED: "true",
      REDDIT_REFRESH_TOKEN: "mock_refresh",
      REDDIT_CLIENT_ID: "test_client",
      REDDIT_USER_AGENT: "TestAgent/1.0",
      HUMAN_APPROVE: "false",
      X_ENABLED: "false",
      PIPELINE_SKIP_MIRA: undefined,
      ALLOW_R_PROGRAMMING: undefined,
    });
  });

  afterEach(() => {
    restoreEnv();
  });

  it("happy path offline: skip mira, mock reddit publish", async () => {
    const result = await runFullCycle({
      skipMira: true,
      miraText: fakeMira,
      candidate: fakeCandidate,
      dbPath,
      platform: "reddit",
      fetchFn: makeTokenFetch(),
    });

    expect(result.ok).toBe(true);
    expect(result.draftId).toBeGreaterThan(0);
    expect(result.published).toBe(true);
    expect(result.reddit?.ok).toBe(true);
    expect(result.reddit?.skipped).toBeUndefined();
  });

  it("dry-run skips publish", async () => {
    const result = await runFullCycle({
      skipMira: true,
      miraText: fakeMira,
      candidate: fakeCandidate,
      dbPath,
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    expect(result.published).toBe(false);
    expect(result.reddit).toBeUndefined();
  });

  it("returns no_candidate when pipeline yields nothing", async () => {
    const spy = spyOn(runCycle, "runPipelineCycle").mockResolvedValue(null);
    try {
      const result = await runFullCycle({ skipMira: true, dbPath });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("no_candidate");
    } finally {
      spy.mockRestore();
    }
  });

  it("stops before publish when pending_approve and HUMAN_APPROVE", async () => {
    process.env.HUMAN_APPROVE = "true";
    const result = await runFullCycle({
      skipMira: true,
      miraText: fakeMira,
      candidate: fakeCandidate,
      dbPath,
      fetchFn: makeTokenFetch(),
    });

    expect(result.ok).toBe(true);
    expect(result.published).toBe(false);
    expect(result.draftStatus).toBe("pending_approve");
    expect(result.reddit).toBeUndefined();
  });
});
