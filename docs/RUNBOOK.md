# MiraArticles runbook

## Disable autopost

- Reddit: `REDDIT_ENABLED=false` — cycle still runs; publish skipped.
- X: `X_ENABLED=false` (default) — no tweet attempts.
- Full pause: `SCHEDULER_ENABLED=false` and do not call `POST /run-cycle` / `bun run cycle:run`.

## Reddit: post flair required (e.g. r/linux)

If publish fails with *Your post must contain post flair*, the sub requires a **link flair** on self posts.

- **API-only:** flair is set via OAuth `flair_id` / `flair_text` on `api/submit`. Browser sessions, cookies, and Playwright are **not** supported (see [`compliance.md`](compliance.md)).
- **Per sub:** set `default_flair_text` or `default_flair_id` on the subreddit in [`config/subreddits.yaml`](../config/subreddits.yaml). Example for `linux`: `default_flair_text: "News"`. To use an id, list templates with OAuth `GET /r/linux/api/link_flair_v2` and set `default_flair_id`.
- **Global fallback:** `REDDIT_DEFAULT_FLAIR_TEXT=News` in `.env` when a sub has no yaml entry.
- **Profile smoke (no flair):** `REDDIT_FORCE_SR=u_c0s1nu7` overrides the target subreddit for `publishDraftToReddit` only; user profiles (`u_*`) skip flair fetch.

## Reddit: text/self posts blocked (technology, netsec)

If publish fails with *This community doesn't allow body text* or *doesn't allow text posts*, the sub is in `REDDIT_BLOCKED_SUBREDDITS` (default `technology,netsec`). Ingest skips those subs; clear the env entry only after confirming link-post or mod-approved workflow.

## Ban or removal on Reddit

1. Stop scheduler and manual runs immediately.
2. Set `REDDIT_ENABLED=false`.
3. Review last posts in `data/miraarticles.db` (`published` table).
4. Do not retry the same URL (`markPublished` dedup); fix content/rules before re-enabling.
5. If mod contact: respond manually; do not autopost to that sub until cleared.

## Rate limit (Reddit / Telegram)

- Reddit API: errors logged in `errors` with stage `reddit-publish`; wait and retry next cron window.
- Telegram `FLOOD_WAIT`: client backs off automatically; if repeated, increase `CRON_INTERVAL_HOURS` or `MIRA_POLL_INTERVAL_MS`.

## Token refresh (Reddit)

- Devvit CLI refresh: `devvit login`, copy `~/.devvit/token` → `token/reddit_token.json`.
- Or set `REDDIT_REFRESH_TOKEN` in `.env`.
- Smoke: `bun run reddit:test --dry-run`.

## X HTTP 402 (credits depleted)

- Developer Portal → Billing → purchase credits.
- Keep `X_ENABLED=false` until credits are active.
- Smoke: `X_ENABLED=true bun run x:test`.

## Mira timeout / no response

- Default timeout: `MIRA_RESPONSE_TIMEOUT_MS=180000`.
- Check session: `bun run telegram:login`, then `bun run test:mira`.
- Failed cycles log `errors` stage `mira`; orchestrator returns `mira_failed` without crashing the process.
- One-shot debug: `PIPELINE_SKIP_MIRA=true bun run cycle:run` (pipeline only).

## Human approve queue

- `HUMAN_APPROVE=true`: drafts stop at `pending_approve`; orchestrator does not publish until you lower the flag or publish manually via `reddit:test` / future approve flow.
- Inspect drafts: SQLite `drafts` where `status = 'pending_approve'`.

## Health and manual cycle

```bash
curl http://localhost:3000/health
curl -X POST http://localhost:3000/run-cycle -H "x-run-secret: $RUN_CYCLE_SECRET"
bun run cycle:run
```

State file: `data/last_cycle.json` (`lastSuccessAt`, `lastRunAt`, `lastError`).
