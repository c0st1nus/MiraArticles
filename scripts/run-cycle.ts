#!/usr/bin/env bun
import { runOnce } from "../src/scheduler/cron";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const skipMira = args.includes("--skip-mira");
const skipPublish = args.includes("--skip-publish");

const result = await runOnce({ dryRun, skipMira, skipPublish });

console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
