/**
 * scripts/test-reddit-post.ts
 *
 * Smoke-test the Reddit publisher without running the full pipeline.
 *
 * Usage:
 *   bun run reddit:test
 *   bun run reddit:test --dry-run
 *   bun run reddit:test --sr u_c0s1nu7
 *   bun run reddit:test --draft-id 42
 *
 * Flags:
 *   --dry-run       Print what would be submitted without making any HTTP call.
 *   --sr <name>     Target subreddit (no r/ prefix). Defaults to REDDIT_TEST_SR or u_c0s1nu7.
 *   --draft-id <n>  Publish a specific validated draft from the DB instead of a test post.
 *
 * Environment:
 *   REDDIT_ENABLED=true          Must be set for live posts.
 *   REDDIT_REFRESH_TOKEN=...     Or populate token/reddit_token.json (copy of ~/.devvit/token).
 *   REDDIT_TEST_SR=u_c0s1nu7    Default test user-profile subreddit.
 */

import { openDatabase, getDraft, draftRowToPipelineDraft } from "../src/pipeline/store";
import { loadCredentials, refreshAccessToken } from "../src/publishers/reddit-auth";
import { submitSelfPost, publishDraftToReddit } from "../src/publishers/reddit";

const args = process.argv.slice(2);

function getFlag(name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const isDryRun = args.includes("--dry-run");
const targetSr = getFlag("--sr") ?? process.env.REDDIT_TEST_SR ?? "u_c0s1nu7";
const draftIdArg = getFlag("--draft-id");

async function main() {
  console.log("[reddit:test] Starting smoke test");
  console.log(`  dry-run: ${isDryRun}`);
  console.log(`  target sr: ${targetSr}`);

  if (draftIdArg) {
    const db = openDatabase();
    const draftId = Number(draftIdArg);
    if (!Number.isFinite(draftId)) {
      console.error(`Invalid --draft-id: ${draftIdArg}`);
      process.exit(1);
    }

    const row = getDraft(db, draftId);
    if (!row) {
      console.error(`Draft #${draftId} not found in DB`);
      process.exit(1);
    }

    const draft = draftRowToPipelineDraft(row);
    console.log(`  draft status: ${draft.status}`);
    console.log(`  reddit title: ${draft.redditTitle}`);
    console.log(`  subreddit: ${draft.subreddit}`);

    if (isDryRun) {
      console.log("\n[dry-run] Would publish draft:");
      console.log(JSON.stringify({ sr: targetSr, title: draft.redditTitle, bodyPreview: draft.body?.slice(0, 200) }, null, 2));
      return;
    }

    const result = await publishDraftToReddit(db, draft, { subredditOverride: targetSr });
    if (result.skipped) {
      console.log("[SKIPPED]", result.error);
    } else if (result.ok) {
      console.log("[OK] Post submitted:", result.url ?? result.postId);
    } else {
      console.error("[FAIL]", result.error);
      process.exit(1);
    }
    return;
  }

  // Default: post a minimal test self-post
  const title = `[MiraArticles smoke test] ${new Date().toISOString()}`;
  const text = `This is an automated smoke test from MiraArticles bot. Posted at ${new Date().toUTCString()}.`;

  if (isDryRun) {
    console.log("\n[dry-run] Would submit:");
    console.log(JSON.stringify({ sr: targetSr, title, text }, null, 2));
    console.log("\nVerifying credentials (token refresh)...");
    const creds = loadCredentials();
    const { expiresIn } = await refreshAccessToken(creds);
    console.log(`  Token OK, expires in ${expiresIn}s`);
    return;
  }

  if (process.env.REDDIT_ENABLED !== "true") {
    console.error("REDDIT_ENABLED is not 'true'. Set it to allow posting. Use --dry-run to skip.");
    process.exit(1);
  }

  const result = await submitSelfPost({ sr: targetSr, title, text });
  if (result.ok) {
    console.log("[OK] Post submitted:", result.url ?? result.postId);
  } else {
    console.error("[FAIL]", result.error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
