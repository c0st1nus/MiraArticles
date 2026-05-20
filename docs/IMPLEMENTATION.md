# Старт имплементации (следующий чат)

Фаза 0–6 **закрыты**. Live X posting **заблокирован** API credits (402) — код готов, `X_ENABLED=false` по умолчанию. Дальше: фаза 7 plugins.

---

## Готово

| Область | Артефакт |
|---------|----------|
| План | [`PLAN.md`](../PLAN.md) |
| Compliance | [`compliance.md`](compliance.md) |
| Сабы + rules | [`subreddit-rules.md`](subreddit-rules.md), [`config/subreddits.yaml`](../config/subreddits.yaml) |
| Источники RSS | [`news-sources.md`](news-sources.md), [`config/sources.yaml`](../config/sources.yaml) |
| Reddit OAuth | `token/reddit_token.json` (Devvit CLI), submit проверен → `u_c0s1nu7` |
| X OAuth 1.0a | `token/x_token.json` — auth OK; live post **402 credits** |
| X publisher (фаза 5) | `src/publishers/x-auth.ts`, `x.ts`, `publishDraftToX`, `scripts/test-x-post.ts`, `bun run x:test` |
| Telegram | `token/telegram.json` (`api_id`, `api_hash`); сессия → `token/telegram.session` (см. §6 PLAN) |
| Mira bot POC | [`mira-bot-protocol.md`](mira-bot-protocol.md), [`telegram-mira-poc.md`](telegram-mira-poc.md) — **live test OK** |
| Ingest (фаза 2) | `src/config/load.ts`, `src/news/*` (RSS/JSON, dedup, scoring, router, aggregator), `scripts/test-ingest.ts` |
| Pipeline (фаза 3) | `src/pipeline/*` (prompt, disclosure, validator, sqlite store, `run-cycle`), `scripts/test-pipeline.ts` |
| Reddit publisher (фаза 4) | `src/publishers/*` (`reddit-auth`, `reddit`, `publishDraftToReddit`), `scripts/test-reddit-post.ts`, `bun run reddit:test` |
| Тест X | `bun run test:x` → `scripts/test-x-post.ts` |
| Unsplash (опц.) | `src/media/`, [`unsplash.md`](unsplash.md) |

---

## Отложено (live only)

- **X live posting** — Billing → Purchase credits; затем `X_ENABLED=true` и `bun run x:test`
- **r/programming** — в autopost **не включать** (ban LLM-written content)
---

## Фаза 1 (Telegram / @mira) — закрыта

```bash
bun run telegram:login   # один раз
bun run test:mira        # промпт → draftText (~10–180s)
bun test
```

См. [`telegram-mira-poc.md`](telegram-mira-poc.md) (GramJS quirks, env, FLOOD_WAIT).

---

## Фаза 4 (Reddit publisher) — закрыта

Модули:

- `src/publishers/types.ts`, `reddit-auth.ts`, `reddit.ts`, `index.ts`
- `scripts/test-reddit-post.ts` — `--dry-run` (refresh only) или live submit
- `publishDraftToReddit` — guards (`REDDIT_ENABLED`, status, programming), post-submit `insertPublished` + `markPublished` + draft `published`

```bash
bun test
bun run reddit:test --dry-run   # token refresh, no post
bun run reddit:test             # live → REDDIT_TEST_SR or u_c0s1nu7
```

Первый live e2e: профиль `u_c0s1nu7`, затем `r/selfhosted` после ручной проверки.

---

## Фаза 5 (X publisher) — закрыта

Модули:

- `src/publishers/x-auth.ts` — `loadXCredentials()` из `X_TOKEN_FILE` (default `token/x_token.json`) или `X_API_KEY` / `X_API_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET`
- `src/publishers/x.ts` — `postTweet` (OAuth 1.0a, `POST /2/tweets`), `publishDraftToX`
- `src/publishers/x.test.ts` — mock fetch, без live API
- `scripts/test-x-post.ts` — thin CLI → `postTweet`

Guards (как Reddit): `X_ENABLED !== "true"` → skip; status `validated` / `pending_approve` (if `HUMAN_APPROVE`); `platform === "x"`; `body` required. Текст — только `draft.body` (ref link в disclosure pipeline, не в каждом твите).

Post-submit: `insertPublished` (`subreddit: "x"`, `platform: "x"`), `updateDraftStatus` → `published`, `markPublished(draft.url)`.

**Блокер live:** X API возвращает HTTP 402 без credits. Код и тесты готовы; включить после покупки credits.

```bash
bun test                    # includes x.test.ts
bun run x:test              # live (needs token + credits + X_ENABLED not required for postTweet alone)
X_ENABLED=true bun run x:test "optional text"
```

---

## Фаза 3 (pipeline) — закрыта

Модули:

- `src/pipeline/types.ts`, `prompt.ts`, `disclosure.ts`, `validator.ts`, `store.ts`, `schema.sql`, `run-cycle.ts`, `index.ts`
- `scripts/test-pipeline.ts`

```bash
bun test
bun run pipeline:test   # offline: PIPELINE_OFFLINE + skip Mira; writes test DB under data/
```

`runPipelineCycle({ skipMira: false })` возвращает `needsMira: true` — вызывающий код (фаза 6) должен `sendPromptToMira` и обновить draft. `markPublished()` в `src/news/dedup.ts` — только после Reddit submit (фаза 4). Similarity — SQLite `published`, не JSON dedup.

---

## Фаза 6 (scheduler + E2E) — закрыта

Модули:

- `src/pipeline/finalize-mira.ts` — `finalizeDraftAfterMira` после ответа @mira
- `src/scheduler/orchestrator.ts` — `runFullCycle` (ingest → pipeline → mira → finalize → publish)
- `src/scheduler/cron.ts` — drift-safe `data/last_cycle.json`, `runSchedulerLoop`, `runOnce`
- `src/index.ts` — `GET /health`, `POST /run-cycle`, scheduler on `SCHEDULER_ENABLED=true`
- `scripts/run-cycle.ts` — CLI one-shot
- `Dockerfile`, `docker-compose.yml`, `deploy/miraarticles.service`, [`RUNBOOK.md`](RUNBOOK.md)

```bash
bun test
bun run cycle:run
bun run cycle:run --dry-run --skip-mira
bun run start
curl http://localhost:3000/health
```

`runFullCycle`: уважает `PIPELINE_SKIP_MIRA`, `REDDIT_ENABLED`, `X_ENABLED`, `HUMAN_APPROVE` (stop at `pending_approve`), `ALLOW_R_PROGRAMMING`.

---

## Фаза 2 (ingest) — закрыта

Модули:

- `src/config/load.ts` — `sources.yaml`, `subreddits.yaml`
- `src/news/types.ts`, `fetch-rss.ts`, `fetch-json.ts`, `canonical-url.ts`, `dedup.ts`, `scoring.ts`, `router.ts`, `aggregator.ts`, `index.ts`
- `scripts/test-ingest.ts`

```bash
bun test
bun run ingest:test   # live fetch + scoring; см. feed errors в stdout
```

---

## Порядок имплементации (рекомендуемый)

```
1. ~~scripts/telegram-login.ts~~ + ~~src/mira/client.ts + parser~~ — ✅ фаза 1
2. ~~src/config/load.ts + src/news/*~~ — ✅ фаза 2
3. ~~src/publishers/reddit.ts~~ — ✅ фаза 4: types, reddit-auth, reddit, index
4. ~~src/pipeline/~~            — ✅ фаза 3: prompt, disclosure, validator, sqlite
5. ~~src/scheduler/*~~         — ✅ фаза 6: orchestrator, cron, Elysia, Docker
6. ~~src/publishers/x.ts~~     — ✅ фаза 5: x-auth, x, publishDraftToX
```

Первый **e2e без Mira**: RSS → draft вручную в коде → Reddit `r/selfhosted` или `u_c0s1nu7`.  
Потом подключить Mira.

---

## Env (скопировать `.env.example` → `.env`)

```bash
X_ENABLED=false
REDDIT_ENABLED=true
TELEGRAM_TOKEN_FILE=token/telegram.json
REDDIT_TOKEN_FILE=token/reddit_token.json
REDDIT_USER_AGENT=MiraArticles/1.0 (by /u/c0s1nu7)
CRON_INTERVAL_HOURS=5
HUMAN_APPROVE=true          # первые недели
MIRA_RESPONSE_TIMEOUT_MS=180000
MIRA_POLL_INTERVAL_MS=2500
```

---

## Reddit (код)

- Refresh: `POST https://www.reddit.com/api/v1/access_token`  
  `-u "${REDDIT_CLIENT_ID}:"` + `grant_type=refresh_token`
- Submit: `POST https://oauth.reddit.com/api/submit`  
  `sr=selfhosted` | `u_c0s1nu7` | …
- Client ID Devvit: `Bep8X2RRjuoyuxkKsKxFuQ` (или из decoded reddit token bundle)

---

## Telegram (код)

- `telegram` (GramJS), `token/telegram.session` после login
- `resolveBotUser()` для @mira (4-char username)
- `sendPromptToMira`: events + poll 2.5s, timeout 180s

---

## Структура каталогов (целевая)

См. [`PLAN.md` §5](../PLAN.md) — создать пустые модули по мере фаз.

---

## Команды для проверки

```bash
bun test
bun run ingest:test     # фаза 2 smoke
bun run pipeline:test   # фаза 3 smoke (offline)
bun run reddit:test --dry-run   # фаза 4 smoke (проверяет токен без реального поста)
bun run reddit:test             # фаза 4 live (требует REDDIT_ENABLED=true)
bun run start
bun run cycle:run
bun run dev
bun run x:test          # live postTweet (после credits)
bun run test:x          # alias
```

---

## Открытые вопросы к пользователю (до/во время кода)

1. Заполнен ли §2–4 в `mira-bot-protocol.md` после ручного чата с @mira?
2. Reddit username для `User-Agent` и `sr=u_*`?
3. Первый целевой саб для autopost: `selfhosted`?
