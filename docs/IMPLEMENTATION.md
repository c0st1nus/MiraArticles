# Старт имплементации (следующий чат)

Фаза 0 (подготовка) **закрыта**. X **отложен** до покупки credits. Reddit + Telegram + ingest — в фокусе MVP.

---

## Готово

| Область | Артефакт |
|---------|----------|
| План | [`PLAN.md`](../PLAN.md) |
| Compliance | [`compliance.md`](compliance.md) |
| Сабы + rules | [`subreddit-rules.md`](subreddit-rules.md), [`config/subreddits.yaml`](../config/subreddits.yaml) |
| Источники RSS | [`news-sources.md`](news-sources.md), [`config/sources.yaml`](../config/sources.yaml) |
| Reddit OAuth | `token/reddit_token.json` (Devvit CLI), submit проверен → `u_c0s1nu7` |
| X OAuth 1.0a | `token/x_token.json` — auth OK, **402 credits** → отложено |
| Telegram | `token/telegram.json` (`api_id`, `api_hash`); сессия → `token/telegram.session` (см. §6 PLAN) |
| Mira bot POC | [`mira-bot-protocol.md`](mira-bot-protocol.md), [`telegram-mira-poc.md`](telegram-mira-poc.md) — **live test OK** |
| Тест X | `bun run test:x` → `scripts/test-x-post.ts` |
| Unsplash (опц.) | `src/media/`, [`unsplash.md`](unsplash.md) |

---

## Отложено

- **X публикация** — Billing → Purchase credits; затем `X_ENABLED=true` и `test:x`
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

## Порядок имплементации (рекомендуемый)

```
1. ~~scripts/telegram-login.ts~~ + ~~src/mira/client.ts + parser~~ — ✅ фаза 1
2. src/config/load.ts          — читать config/*.yaml, token/* (без коммита)
3. src/publishers/reddit.ts    — refresh + POST /api/submit
4. src/news/aggregator.ts      — RSS из config/sources.yaml, dedup
5. src/pipeline/               — prompt, disclosure, validator, sqlite
6. src/scheduler/cron.ts       — 5h, 1 sub per cycle, route по тегам
7. src/publishers/x.ts         — заглушка if !X_ENABLED
```

Первый **e2e без Mira**: RSS → draft вручную в коде → Reddit `r/selfhosted` или `u_c0s1nu7`.  
Потом подключить Mira. X — последним.

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
bun run dev
bun run test:x          # после credits
# reddit refresh + submit — вынести в scripts/test-reddit-post.ts при имплементации
```

---

## Открытые вопросы к пользователю (до/во время кода)

1. Заполнен ли §2–4 в `mira-bot-protocol.md` после ручного чата с @mira?
2. Reddit username для `User-Agent` и `sr=u_*`?
3. Первый целевой саб для autopost: `selfhosted`?
