#!/usr/bin/env bun
/**
 * Live ingest smoke test — fetches all enabled feeds (network required).
 * Does not call markPublished(); use that from the future pipeline after Reddit submit.
 */
import { runIngestCycle } from "../src/news/index";

function fmtDate(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19);
}

function hoursAgo(d: Date): string {
  const h = (Date.now() - d.getTime()) / (1000 * 60 * 60);
  return `${h.toFixed(1)}h ago`;
}

console.log("MiraArticles ingest cycle\n");

const result = await runIngestCycle();

if (result.errors.length > 0) {
  console.log("Feed errors:");
  for (const e of result.errors) console.log(`  - ${e}`);
  console.log();
}

console.log(`Fetched ${result.fetchedCount} items (before dedup)`);
console.log(`Scored ${result.items.length} after dedup\n`);

const top = result.items.slice(0, 3);
console.log("Top 3 scored:");
for (let i = 0; i < top.length; i++) {
  const it = top[i]!;
  console.log(
    `${i + 1}. [${it.score.toFixed(1)}] ${it.title.slice(0, 72)}${it.title.length > 72 ? "…" : ""}`,
  );
  console.log(`   ${it.url}`);
  console.log(`   tier=${it.tier} source=${it.source} ${hoursAgo(it.publishedAt)} tags=${it.tags.join(",")}`);
  if (it.summary) console.log(`   summary: ${it.summary.slice(0, 120)}${it.summary.length > 120 ? "…" : ""}`);
  console.log();
}

if (result.candidate) {
  const c = result.candidate;
  console.log("Chosen for cycle:");
  console.log(`  r/${c.subreddit}`);
  console.log(`  score=${c.score.toFixed(1)} title=${c.title}`);
  console.log(`  url=${c.url}`);
  console.log(`  published=${fmtDate(c.publishedAt)} postLang=${c.postLang}`);
} else {
  console.log("No candidate (empty feeds or all deduped).");
}
