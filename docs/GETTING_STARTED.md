# Старт и эксплуатация

Краткий runbook для разработки и smoke-проверок. Roadmap и архитектура — [`PLAN.md`](../PLAN.md).

**Статус:** фазы 0–2 **закрыты**. X **отложен** (402 credits). Дальше: publishers + pipeline (фаза 3).

---

## Что уже готово

| Область | Артефакт |
|---------|----------|
| План | [`PLAN.md`](../PLAN.md) |
| Compliance | [`compliance.md`](compliance.md) |
| Сабы + rules | [`subreddit-rules.md`](subreddit-rules.md), [`config/subreddits.yaml`](../config/subreddits.yaml) |
| Источники RSS | [`news-sources.md`](news-sources.md), [`config/sources.yaml`](../config/sources.yaml) |
| Reddit OAuth | `token/reddit_token.json` (Devvit CLI), submit проверен |
| X OAuth 1.0a | `token/x_token.json` — auth OK, **402 credits** → отложено |
| Telegram | `token/telegram.json`; сессия → `token/telegram.session` |
| Mira bot POC | [`mira-bot-protocol.md`](mira-bot-protocol.md), [`telegram-mira-poc.md`](telegram-mira-poc.md) — live test OK |
| Ingest (фаза 2) | `src/config/load.ts`, `src/news/*`, `scripts/test-ingest.ts` |
| Unsplash (опц.) | `src/media/`, [`unsplash.md`](unsplash.md) |

---

## Env: `.env.example` → `.env`

```bash
cp .env.example .env
```

Минимум для текущих фаз:

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

### Важно: пустые `TELEGRAM_API_*` в `.env`

В `.env.example` есть комментарий:

> Leave `TELEGRAM_API_ID`/`HASH` unset to use `token/telegram.json` — **empty `.env` lines override JSON!**

Если в `.env` стоят строки `TELEGRAM_API_ID=` или `TELEGRAM_API_HASH=` **без значения**, код читает пустую строку вместо JSON — логин и `test:mira` падают. Решение:

- закомментировать эти строки в `.env`, **или**
- удалить их и хранить credentials только в `token/telegram.json` (шаблон: `config/telegram.json.example`).

`api_hash` — **ровно 32** hex-символа. Подробнее: [`telegram-mira-poc.md`](telegram-mira-poc.md).

---

## Проверка по фазам

### Фаза 1 — Telegram / @mira

```bash
bun run telegram:login   # один раз
bun run test:mira        # промпт → draftText (~10–180s)
bun test
```

См. [`telegram-mira-poc.md`](telegram-mira-poc.md) (GramJS quirks, FLOOD_WAIT).

### Фаза 2 — ingest

```bash
bun test
bun run ingest:test   # live fetch + scoring; ошибки feed — в stdout
```

Модули: `src/config/load.ts`, `src/news/*` (RSS/JSON, dedup, scoring, router, aggregator).

### Общие команды

```bash
bun test
bun run ingest:test
bun run dev
bun run test:x          # после пополнения X credits
```

---

## Токены (без секретов в репозитории)

| Платформа | Где хранить | Как получить |
|-----------|-------------|--------------|
| Telegram | `token/telegram.json` + `token/telegram.session` | [my.telegram.org/apps](https://my.telegram.org/apps), `bun run telegram:login` |
| Reddit | `token/reddit_token.json` | `devvit login` → копия `~/.devvit/token`; refresh через Devvit client_id (см. `PLAN.md` §6.3) |
| X | `token/x_token.json` | Developer Portal, OAuth 1.0a; постинг при `X_ENABLED=true` после credits |

**Reddit (код, когда будет publisher):**

- Refresh: `POST https://www.reddit.com/api/v1/access_token` с `-u "${REDDIT_CLIENT_ID}:"` + `grant_type=refresh_token`
- Submit: `POST https://oauth.reddit.com/api/submit` (`sr=selfhosted` | `u_<username>` и т.д.)

**Telegram (код):**

- GramJS, `resolveBotUser()` для @mira (4-char username)
- `sendPromptToMira`: events + poll 2.5s, timeout 180s

---

## Рекомендуемый порядок: фазы 3–6

```
1. ~~scripts/telegram-login.ts + src/mira/*~~ — ✅ фаза 1
2. ~~src/config/load.ts + src/news/*~~ — ✅ фаза 2
3. src/publishers/reddit.ts    — refresh + POST /api/submit
4. src/pipeline/               — prompt, disclosure, validator, sqlite
5. src/scheduler/cron.ts       — 5h, 1 sub per cycle, route по тегам
6. src/publishers/x.ts         — заглушка if !X_ENABLED
```

Первый **e2e без Mira**: RSS → draft вручную в коде → Reddit `r/selfhosted` или профиль. Потом подключить Mira. X — последним.

---

## Отложено

- **X публикация** — Billing → Purchase credits; затем `X_ENABLED=true` и `bun run test:x`
- **r/programming** — в autopost **не включать** (ban LLM-written content); только с `ALLOW_R_PROGRAMMING=true`

---

## Открытые вопросы (до/во время кода)

1. Заполнен ли §2–4 в `mira-bot-protocol.md` после ручного чата с @mira?
2. Reddit username для `User-Agent` и `sr=u_*` — актуален ли в `.env`?
3. Первый целевой саб для autopost: `selfhosted`?

---

## Ссылки

- [`PLAN.md`](../PLAN.md) — полный план, §5 структура репозитория, §6 секреты
- [`compliance.md`](compliance.md)
- [`telegram-mira-poc.md`](telegram-mira-poc.md)
