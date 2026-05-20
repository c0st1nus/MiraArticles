#!/usr/bin/env bun
/**
 * Pipeline dry run — disclosure + validate + SQLite (no Telegram).
 * Set PIPELINE_OFFLINE=true to skip live ingest and use a fake candidate.
 */
import { join } from "path";
import { projectDataDir } from "../src/config/load";
import { runPipelineCycle } from "../src/pipeline/run-cycle";
import type { IngestCandidate } from "../src/news/types";

const offline = process.env.PIPELINE_OFFLINE === "true";

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

const dbPath = join(projectDataDir(), `pipeline-test-${Date.now()}.db`);

console.log("MiraArticles pipeline dry run\n");
console.log(`DB: ${dbPath}`);
console.log(`PIPELINE_SKIP_MIRA / skipMira: true`);
console.log(`PIPELINE_OFFLINE: ${offline}\n`);

const result = await runPipelineCycle({
  skipMira: true,
  miraText: fakeMira,
  candidate: offline ? fakeCandidate : undefined,
  dbPath,
});

if (!result) {
  console.error(
    "No ingest candidate. Re-run with PIPELINE_OFFLINE=true or fix feeds.",
  );
  process.exit(1);
}

console.log("--- Mira prompt (for @mira when not skipping) ---\n");
console.log(result.miraPrompt);
console.log("\n--- Draft ---");
console.log(`id: ${result.draftId}`);
console.log(`status: ${result.draft.status}`);
console.log(`r/${result.draft.subreddit}`);
console.log(`needsMira: ${result.needsMira}`);
if (result.draft.errors.length) {
  console.log(`validation errors: ${result.draft.errors.join("; ")}`);
}
console.log("\n--- body (with disclosure) ---\n");
console.log(result.draft.body);
