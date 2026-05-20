# MiraArticles — план проекта

Автоматизированный конвейер: **новости IT → запрос к боту Mira через Telegram MTProto → пост с дисклеймером → публикация в Reddit и X** по расписанию (каждые ~5 часов).

> **Статус (2026-05-20):** Фаза 0–3 **закрыты** (ingest + pipeline OK, 50 tests). POC: [`docs/telegram-mira-poc.md`](docs/telegram-mira-poc.md), runbook: [`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md). **Reddit** — OAuth готов. **X** — отложено (402). Дальше → **фаза 4** (`src/publishers/reddit.ts`).

---

## 1. Цели и границы

### 1.1 Цели
| # | Цель |
|---|------|
| G1 | Каждые **5 часов** находить актуальную IT-новость и формировать пост (текст + ссылка на первоисточник). |
| G2 | Текст **частично генерируется через Mira** (`@mira` в Telegram) с фиксированным дисклеймером и реф-ссылкой. |
| G3 | Публиковать через **официальные API** Reddit и X (без browser automation / scraping UI). |
| G4 | Архитектура с **плагинами** для будущих платформ (LinkedIn, Mastodon, Telegram-канал и т.д.). |
| G5 | Минимизировать риск **бана** за спам, self-promo, нарушение ToS и авторских прав. |

### 1.2 Вне скоупа (v1)
- Полностью безлюдный продакшен без human review (рекомендуется soft-approve первые 2–4 недели).
- Парсинг закрытых paywall-источников.
- Массовый кросс-постинг одного текста в десятки сабреддитов.
- Обход rate limits / CAPTCHA / блокировок платформ.

### 1.3 Обязательные элементы поста
Шаблон (адаптировать под лимиты символов X):

```
[Краткий заголовок / хук]

[2–4 абзаца: суть новости + ваш комментарий/контекст]

Источник: <URL оригинала>

---
Частично подготовлено с помощью Mira (AI-ассистент в Telegram).
Попробовать: https://t.me/mira?start=ref_1239398217
```

**X:** ссылку на источник + короткий дисклеймер; реф-ссылку чаще держать в **bio/pinned**, а не в каждом твите (снижает spam-score).  
**Reddit:** дисклеймер в теле self-post; реф-ссылку — только если правила саба разрешают promo (см. §4).

---

## 2. Высокоуровневая архитектура

```mermaid
flowchart TB
  subgraph ingest [Ingest]
    CRON[Scheduler 5h]
    RSS[News sources RSS/API]
    DEDUPE[Dedup + scoring]
  end

  subgraph mira [Mira]
    MTP[MTProto client GramJS]
    BOT[@mira bot dialog]
    PARSE[Response parser]
  end

  subgraph pipeline [Pipeline]
    PROMPT[Prompt builder]
    VALID[Validator + policy checks]
    QUEUE[(Draft queue DB)]
    REVIEW[Optional human approve]
  end

  subgraph publish [Publishers]
    REDDIT[Reddit OAuth API]
    XAPI[X API v2]
  end

  subgraph ops [Ops]
    LOG[Audit log]
    METRICS[Metrics + alerts]
  end

  CRON --> RSS --> DEDUPE --> PROMPT --> MTP --> BOT --> PARSE --> VALID --> QUEUE
  QUEUE --> REVIEW --> REDDIT
  REVIEW --> XAPI
  REDDIT --> LOG
  XAPI --> LOG
```

### 2.1 Принципы
- **Один оркестратор** (Bun + Elysia или отдельный worker) — cron, API health, ручной re-run.
- **Идемпотентность:** hash(источник + заголовок) → не публиковать дважды.
- **Fail-safe:** ошибка Mira/Reddit/X не роняет весь цикл; retry с backoff.
- **Разделение секретов:** MTProto session, Reddit refresh, X OAuth — только env/secret store.

---

## 3. Фазы реализации

### Фаза 0 — Compliance & discovery (1–2 недели)
**Задачи**
- [x] Список сабреддитов → [`config/subreddits.yaml`](config/subreddits.yaml), культура/риски → [`docs/news-sources.md`](docs/news-sources.md#сабреддиты-культура-и-риск-для-miraarticles)
- [x] Правила сабов → [`docs/subreddit-rules.md`](docs/subreddit-rules.md) (**r/programming: LLM-written banned**)
- [x] **Reddit user OAuth** — `devvit login` → `token/reddit_token.json` (см. §6.3)
- [x] **X OAuth 1.0a** — `token/x_token.json`; auth OK; постинг **отложен** (credits, `X_ENABLED=false`)
- [x] `token/telegram.json` (api_id/hash); сессия → `token/telegram.session` при логине (фаза 1)
- [ ] Разведка **@mira** — опционально до кода; шаблон в [`docs/mira-bot-protocol.md`](docs/mira-bot-protocol.md) §2

**Артефакты:** [`docs/compliance.md`](docs/compliance.md), [`docs/mira-bot-protocol.md`](docs/mira-bot-protocol.md), [`docs/subreddit-rules.md`](docs/subreddit-rules.md), [`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md).

**Фаза 0 — DONE.**

---

### Фаза 1 — Mira / MTProto POC (1 неделя)
**Стек:** [GramJS](https://gram.js.org/) (`telegram` npm) на Bun; альтернатива — `@mtcute/core` (меньше примеров).

**Задачи**
- [x] `token/telegram.json` — api_id / api_hash
- [x] Интерактивный логин → `token/telegram.session` — `bun run telegram:login`
- [x] Тестовый промпт @mira — `bun run test:mira` (проверено 2026-05-20)
- [x] Парсер: текст, inline-кнопки — `src/mira/parser.ts` + `bun test`
- [x] `resolveBotUser`, `FLOOD_WAIT` retry, streaming idle 2.5s, timeout 180s, 2FA — `src/mira/client.ts`

**Артефакты:** `src/mira/*`, `scripts/telegram-login.ts`, `scripts/test-mira-prompt.ts`, [`docs/telegram-mira-poc.md`](docs/telegram-mira-poc.md).

**Фаза 1 — DONE.**

**Риски Telegram**
- Автоматизация **user-аккаунта** — серая зона [ToS](https://telegram.org/tos) / [API ToS](https://core.telegram.org/api/terms): действия должны быть с **явного согласия владельца** аккаунта.
- Не скрапить чужие данные; только диалог с ботом.
- Лимиты: не чаще 1 целевого диалога / 5 ч; exponential backoff на flood.

---

### Фаза 2 — News ingest (3–5 дней)
**Быстрые источники (Tier S)** — полный каталог: [`docs/news-sources.md`](docs/news-sources.md), конфиг: [`config/sources.yaml`](config/sources.yaml).

| Приоритет | Источник | RSS | Зачем |
|-----------|----------|-----|-------|
| S | [OpenNet](https://www.opennet.ru/) | `opennews_all_noadv.rss`, `opennews_mini_noadv.rss` | RU-радар, security/linux быстрее многих EN-сайтов |
| S | HN newest | `hnrss.org/newest` | programming, breaking links |
| S | Lobste.rs | `lobste.rs/newest.rss` | curated tech, security |
| S | TechMeme | `techmeme.com/feed.xml` | агрегация «что сейчас обсуждают» |
| S | Phoronix | `phoronix.com/rss.php` | r/linux |
| S | BleepingComputer / Register Security | см. конфиг | r/netsec, r/sysadmin |
| A | CISA KEV JSON | feed на cisa.gov | exploited CVE |

**Целевые сабреддиты** (не кросс-постить один текст):

| Саб | Фокус | Риск promo |
|-----|-------|------------|
| r/programming | разработка | высокий |
| r/linux | Linux/OSS | средний |
| r/opensource | open source | средний |
| r/technology | широкие IT | **очень высокий** |
| r/sysadmin | инфра/enterprise | высокий |
| r/devops | CI/CD, k8s | средний |
| r/netsec | уязвимости | **очень высокий** |
| r/selfhosted | homelab | средний (лучший старт) |

**Правило публикации:** **1 пост за цикл (5ч) → 1 саб** по маршрутизации тегов + ротация. См. `route_to_subreddit` в `config/sources.yaml`.

**Задачи**
- [x] Агрегатор RSS/JSON → `{ title, url, summary, publishedAt, source, tags }`.
- [x] Scoring: Tier S first, свежесть < 6h, dedup 72h по canonical URL.
- [x] Router: тег → сабреддит (таблица в docs).
- [x] Промпт Mira: язык поста EN для Reddit, summary только из RSS (не full scrape).

**Авторское право**
- Не копировать полный текст статей.
- Краткое **собственное изложение** + обязательная ссылка на источник.
- Избегать больших цитат; при цитате — `<blockquote>` и имя издания.

---

### Фаза 3 — Content pipeline (1 неделя) — ✅ DONE (2026-05-20)
**Декомпозиция (2026-05-20)**
| Модуль | Файл | Статус |
|--------|------|--------|
| Типы + оркестрация цикла | `src/pipeline/types.ts`, `run-cycle.ts` | ✅ |
| Промпт Mira | `src/pipeline/prompt.ts` | ✅ |
| Disclosure / post-process | `src/pipeline/disclosure.ts` | ✅ |
| Validator (length, words, similarity) | `src/pipeline/validator.ts` | ✅ |
| SQLite store | `src/pipeline/store.ts`, `schema.sql` | ✅ |
| Smoke script | `scripts/test-pipeline.ts` | ✅ |
| Тесты | `src/pipeline/*.test.ts` | ✅ |

**Решения:** `bun:sqlite` + `DATABASE_URL` (default `file:./data/miraarticles.db`); similarity — Jaccard по словам, порог `SIMILARITY_MAX` (default 0.85); ref Mira только если `risk_promo` ∈ {low, medium}; EN для Reddit (`postLang`); `markPublished` (dedup JSON) — из фазы 4 после submit, pipeline пишет в `published`.

**Задачи**
- [x] Prompt templates (RU/EN в зависимости от саба/аудитории).
- [x] Post-processor: вставка дисклеймера, UTM не нужен для `t.me` start param.
- [x] Linter правил:
  - длина (X 280/25k premium; Reddit title ≤300);
  - запрещённые слова;
  - **similarity check** с прошлыми постами (не постить «то же» в другой саб).
- [x] SQLite: `drafts`, `published`, `errors`.

**Опционально v1.5:** Telegram-уведомление «Approve?» с inline-кнопками перед публикацией — **не в v1 фазы 3**.

---

### Фаза 4 — Reddit publisher (1–2 недели)
**User OAuth (без своего app на prefs/apps)**
- Источник токенов: `devvit login` → `~/.devvit/token` → локальная копия `token/reddit_token.json`.
- `client_id`: Devvit CLI (`Bep8X2RRjuoyuxkKsKxFuQ`), `client_secret`: пустой.
- Refresh: `POST https://www.reddit.com/api/v1/access_token` с `-u "CLIENT_ID:"` + `grant_type=refresh_token`.
- Submit: `POST https://oauth.reddit.com/api/submit` с `Authorization: Bearer <access>`.
- Документация submit: https://github.com/reddit-archive/reddit/wiki/API:-submit
- Профиль: `sr=u_<username>`; сабы: `sr=programming` и т.д. (без `r/`).
- Проверено: тестовый self-post в `u_c0s1nu7` через curl.

**Compliance Reddit (критично)**
| Правило | Источник | Практика |
|---------|----------|----------|
| Явное одобрение API | [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564) | Зарегистрировать app, label, не маскировать цель |
| Запрет spam / duplicate | Там же | **1 сабреддит / 1 пост**; не кросс-постить идентичный текст |
| Self-promotion 9:1 | [wiki selfpromotion](https://www.reddit.com/wiki/selfpromotion) | 90% участие без ссылок на Mira; на старте — ручные комментарии от аккаунта |
| App account ≠ личный | Responsible Builder | Отдельный u/MiraArticles_bot или чётко помеченный бот-аккаунт |
| AI / commercial data | [Data API Terms](https://redditinc.com/policies/data-api-terms) | Не обучать модели на данных Reddit; commercial — письменное одобрение |
| Саб-правила | каждый sub | Модераторский approve до autopost в «строгих» сабах |

**Что банит быстро**
- Одинаковый текст + реф-ссылка в 5+ сабах за день.
- Новый аккаунт + только promo-посты.
- Только link-post на t.me без контента.
- Ignoring removal / mod mail.

**Стратегия запуска (rollout)**
1. Сабы по порядку: `selfhosted` → `linux` → `opensource` → `devops` → … → `technology` / `netsec` последними ([`config/subreddits.yaml`](config/subreddits.yaml)).
2. **1 саб / 1 цикл** — никогда не дублировать один draft в r/linux + r/opensource + … .
3. В r/netsec и r/technology — без реф-ссылки Mira в теле; только AI disclosure + источник.
4. Ручной approve первые 2–4 недели; autopost после 10 постов без removal.

**Код:** `src/publishers/reddit.ts`, конфиг сабов — `config/subreddits.yaml`.

---

### Фаза 5 — X publisher (1 неделя) — ⏸ ОТЛОЖЕНО
**Только X API v2** — `POST /2/tweets`  
Документация: https://developer.x.com/x-api/posts/creation-of-a-post

**Блокер:** Billing → Credits ($0) → 402 `CreditsDepleted`. Токены в `token/x_token.json` готовы; после пополнения → `bun run test:x`.

**Аутентификация:**
- Постинг: OAuth 1.0a (`consumer_*` + `access_*`) — см. `scripts/test-x-post.ts`
- `client_id` / `client_secret` — OAuth 2.0 на будущее
- `bearer_key` — не для постов

**Лимиты (ориентир, проверять в portal)**
| Tier | POST /2/tweets (ориентир) |
|------|---------------------------|
| Free | ~17/24h per user (низкий); также monthly post cap ~1500/app |
| Basic | выше (платный) |
| Pro | 100/15min per user |

При **1 пост / 5ч ≈ 4–5/день** Free tier обычно достаточен по объёму — проверить **write access** в Developer Portal.

**Compliance X**
| Правило | Источник | Практика |
|---------|----------|----------|
| Automation policy | https://help.x.com/en/rules-and-policies/x-automation | Осмысленный контент; не @mention spam; не DM spam |
| Только API | Automation rules | **Никакого** Playwright/Puppeteer posting |
| Прозрачность | Automation + bio | Bio: «Automated account. Posts assisted by AI (Mira).» |
| AI content | evolving platform rules | Явная пометка в тексте |
| Affiliate | Spam policies | Реф-ссылку не в каждом твите; disclosure «affiliate» если требуется FTC |

**OAuth 2.0 PKCE** для user context posting; хранить refresh token securely.

**Код:** `src/publishers/x.ts`, media upload отложить на v2.

---

### Фаза 6 — Scheduler & production (1 неделя)
- [ ] Cron: `0 */5 * * *` (или drift-safe: «следующий запуск = last_success + 5h»).
- [ ] Docker / systemd unit на VPS.
- [ ] Health: `/health`, Prometheus или простой uptime ping.
- [ ] Алерты: failed publish, Mira timeout, token expiry <7d.

---

### Фаза 7 — Плагины и расширения
Интерфейс:

```ts
interface Publisher {
  name: string;
  publish(draft: Draft): Promise<PublishResult>;
  validate(draft: Draft): ValidationResult;
}
```

Будущие: Mastodon (ActivityPub API), Bluesky (atproto), Telegram Channel (Bot API — здесь Bot API уместен, т.к. свой канал).

---

## 4. Матрица соответствия (legal / ToS)

### 4.1 Reddit — сводка
- ✅ OAuth official API, user token (Devvit CLI client + refresh).
- ✅ Уникальный контент per subreddit, value-add commentary.
- ✅ Дисклеймер AI в теле поста.
- ⚠️ Реф-ссылка `t.me/mira?start=ref_...` = **self-promotion** → правило 10:1, возможен ban в крупных сабах.
- ❌ Scraping old.reddit.com без API.
- ❌ Массовый autopost без mod approval.
- ❌ Использование данных Reddit для обучения LLM.

### 4.2 X — сводка
- ✅ API v2 с OAuth user context.
- ✅ ~5 постов/день в пределах tier caps.
- ⚠️ Automated account labeling в профиле.
- ❌ UI automation, buying engagement, duplicate @replies.

### 4.3 Telegram MTProto
- ✅ Личный аккаунт владельца, session зашифрован.
- ✅ Только диалог с @mira по согласию пользователя.
- ⚠️ Не продавать/передавать session; 2FA обязательна.
- ❌ Массовый инвайт / парсинг групп.

### 4.4 FTC / disclosure (США, но best practice везде)
Если `ref_1239398217` — **affiliate/referral**, в посте явно:
> «Ссылка на Mira — реферальная; я могу получить бонус при регистрации.»

Плюс AI disclosure (уже в шаблоне). Это снижает риск претензий по deceptive marketing.

### 4.5 IT-новости и copyright
| Действие | Риск | Рекомендация |
|----------|------|----------------|
| Перепечатка статьи | Высокий | Только summary + link |
| Скриншоты | Средний | Не использовать в v1 |
| RSS title + own words | Низкий | OK с attribution |
| HN link post | Низкий | `kind=link` на оригинал + комментарий в text (Reddit) |

---

## 5. Структура репозитория (целевая)

```
MiraArticles/
├── PLAN.md
├── docs/
│   ├── compliance.md
│   └── mira-bot-protocol.md
├── src/
│   ├── index.ts              # Elysia: health, manual triggers
│   ├── scheduler/cron.ts
│   ├── news/
│   │   ├── aggregator.ts
│   │   └── sources/*.ts
│   ├── mira/
│   │   ├── client.ts         # GramJS MTProto
│   │   └── parser.ts
│   ├── pipeline/
│   │   ├── prompt.ts
│   │   ├── validator.ts
│   │   └── store.ts
│   └── publishers/
│       ├── reddit.ts
│       ├── x.ts
│       └── types.ts
├── config/
│   ├── subreddits.yaml
│   └── sources.yaml
├── .env.example
└── token/                    # в .gitignore, только local (см. §6.2)
    ├── reddit_token.json     # копия ~/.devvit/token
    └── x_token.json          # user OAuth + опционально app keys
```

---

## 6. Конфигурация и секреты

### 6.1 Локальная директория `token/` (не коммитить)

В `.gitignore` уже есть `token/` и `.env`. Секреты **только на диске**, не в репозитории.

| Файл | Содержимое |
|------|------------|
| `token/reddit_token.json` | Копия `~/.devvit/token` после `devvit login` (base64 bundle с `refreshToken`, `accessToken`, `expiresAt`) |
| `token/x_token.json` | User OAuth для постинга (см. §6.4) — **не** только Bearer |
| `token/telegram.session` | (опционально) StringSession MTProto |

Синхронизация Reddit: при `devvit login` / `devvit` CLI файл `~/.devvit/token` может обновляться — для VPS скопировать refresh в `.env` или re-copy json.

### 6.2 Переменные окружения (код читает env или парсит `token/*.json`)

```bash
# Telegram MTProto
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
TELEGRAM_SESSION=

# Mira
MIRA_BOT_USERNAME=mira

# Reddit (из token/reddit_token.json или env)
REDDIT_CLIENT_ID=Bep8X2RRjuoyuxkKsKxFuQ
REDDIT_CLIENT_SECRET=
REDDIT_REFRESH_TOKEN=          # из decoded token.refreshToken
REDDIT_USER_AGENT=MiraArticles/1.0 (by /u/c0s1nu7)
REDDIT_TOKEN_FILE=token/reddit_token.json

# X — для POST /2/tweets нужен USER context (§6.4)
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=                # OAuth 2.0 user access (не App Bearer)
X_ACCESS_TOKEN_SECRET=         # если OAuth 1.0a
X_REFRESH_TOKEN=               # OAuth 2.0 PKCE + offline.access
X_TOKEN_FILE=token/x_token.json

# App
DATABASE_URL=file:./data/miraarticles.db
CRON_INTERVAL_HOURS=5
DISCLOSURE_REF_URL=https://t.me/mira?start=ref_1239398217
HUMAN_APPROVE=false
```

### 6.3 Reddit: загрузка и refresh (Devvit token)

```bash
# Декод (как в вашем скрипте)
python3 -c "
import json, base64
raw = json.load(open('token/reddit_token.json'))
print(json.loads(base64.b64decode(raw['token']+'==').decode())['refreshToken'])
"

# Refresh access (secret пустой)
curl -s -X POST https://www.reddit.com/api/v1/access_token \
  -u 'Bep8X2RRjuoyuxkKsKxFuQ:' \
  -A 'MiraArticles/1.0 (by /u/c0s1nu7)' \
  -d "grant_type=refresh_token&refresh_token=$REDDIT_REFRESH_TOKEN"
```

**Заметка:** client_id Devvit — для разработки на платформе Reddit; внешний cron-бот — серая зона (см. риски §8).

### 6.4 X: что есть и что ещё нужно

| Credential в Developer Portal | Для чего | Для **постинга** твитов |
|------------------------------|----------|-------------------------|
| **Bearer Token** (App-only) | Публичное чтение API | ❌ Недостаточно |
| **API Key + API Key Secret** | OAuth 1.0a / база приложения | ✅ Нужны |
| **OAuth 2.0 Client ID + Client Secret** | User login PKCE | ✅ Нужны (если PKCE) |
| **Access Token + Refresh Token** (user) | Действия от имени аккаунта | ✅ **Обязательны** |

**Шаги один раз:**
1. [Developer Portal](https://developer.x.com/en/portal/dashboard) → проект → **User authentication settings** → включить OAuth 2.0, type **Web App** или **Native**, callback например `http://localhost:3000/callback`.
2. Scopes: `tweet.write`, `tweet.read`, `users.read`, `offline.access`.
3. Пройти authorize в браузере → получить **access_token** + **refresh_token** → сохранить в `token/x_token.json`.
4. App Bearer Token хранить отдельно (опционально, для read-only проверок) — **не путать** с user access.

Пример структуры `token/x_token.json` (без реальных значений):

```json
{
  "consumer_key": "",
  "consumer_key_secret": "",
  "access_token": "",
  "access_token_secret": "",
  "client_id": "",
  "client_secret": "",
  "bearer_key": "",
  "oauth2_access_token": "",
  "oauth2_refresh_token": ""
}
```

Постинг через `scripts/test-x-post.ts` — только **OAuth 1.0a** (первые 4 поля). `client_id`/`client_secret` — для OAuth 2 (позже).

Документация: [authentication mapping](https://docs.x.com/fundamentals/authentication/guides/v2-authentication-mapping), [manage tweets quick start](https://developer.x.com/en/docs/twitter-api/tweets/manage-tweets/quick-start).

### 6.5 Безопасность
1. `token/` и `.env` — **никогда** в git (уже в `.gitignore`).
2. Токены, показанные в чате/логах — **перевыпустить** в портале (X Bearer, Reddit refresh).
3. Отдельные аккаунты Reddit/X для бота — по возможности.

---

## 7. Промпт для Mira (черновик)

```
Ты помогаешь написать пост для {platform} (Reddit|X).

Новость:
- Заголовок: {title}
- URL: {url}
- Кратко: {summary}

Требования:
- Язык: {lang}
- Тон: информативный, без кликбейта
- 150–400 слов для Reddit; до 240 символов основного текста для X (+ thread optional)
- Не выдумывай факты beyond summary
- В конце НЕ добавляй реф-ссылку (её добавит pipeline)

Верни только текст поста.
```

---

## 8. Риски и митигации

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| Ban Reddit за spam | Высокая при агрессии | 1 sub, 9:1, mod approve, уникальные тексты |
| Ban X за automation | Средняя | API only, bio disclosure, no @spam |
| Telegram flood / ban | Средняя | 5h interval, backoff |
| Mira timeout / format change | Средняя | Timeout + fallback «skip cycle» |
| Copyright claim | Низкая–средняя | Summary only + source link |
| Affiliate без disclosure | Средняя | FTC-style строка в каждом посте |
| Утечка session/token | Высокая если в git | secrets + rotate |

---

## 9. Метрики успеха (KPI)

- Publish success rate > 95%
- 0 removals / spam reports в первый месяц
- Среднее время цикла < 3 мин
- 0 секретов в git
- Engagement (upvotes / likes) — мониторинг, не оптимизировать накруткой

---

## 10. Оценка сроков

| Фаза | Длительность |
|------|----------------|
| 0 Compliance & discovery | 1–2 нед |
| 1 MTProto POC | 1 нед |
| 2 News ingest | 3–5 дн |
| 3 Pipeline | 1 нед |
| 4 Reddit | 1–2 нед |
| 5 X | 1 нед |
| 6 Production | 1 нед |
| **Итого MVP** | **~6–8 недель** part-time |

---

## 11. Альтернативы (если MTProto окажется хрупким)

1. **Договориться с владельцами Mira** о HTTP webhook/API (лучший вариант).
2. **Bot API** — только если Mira поддерживает deep linking с user context (обычно нет для чужого бота).
3. **Ручной copy-paste** на этапе approve (semi-auto).

---

## 12. Чеклист перед первым автопостом

- [ ] Reddit app зарегистрирован, refresh token работает
- [ ] X Developer app с write permission
- [ ] Выбран 1 сабреддит, mod одобрил или rules проверены
- [ ] Bio X обновлён (automated + AI)
- [ ] Дисклеймер AI + affiliate протестирован юридически
- [ ] `.gitignore` закрывает все токены
- [ ] 10 тестовых draft без публикации — similarity < 0.85 между соседними
- [ ] Runbook: что делать при ban / rate limit

---

## Ссылки

- Reddit Responsible Builder: https://support.reddithelp.com/hc/en-us/articles/42728983564564
- Reddit Data API Terms: https://redditinc.com/policies/data-api-terms
- Reddit API submit: https://github.com/reddit-archive/reddit/wiki/API:-submit
- X automation: https://help.x.com/en/rules-and-policies/x-automation
- X rate limits: https://developer.x.com/x-api/fundamentals/rate-limits
- Telegram ToS: https://telegram.org/tos
- Telegram API ToS: https://core.telegram.org/api/terms
- GramJS: https://gram.js.org/
