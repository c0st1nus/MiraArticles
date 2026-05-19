# Compliance — MiraArticles

> Не юридическая консультация. Чеклист для снижения риска бана и отзыва API. Обновлять при смене политик платформ.

## 1. Общие принципы проекта

| Принцип | Реализация |
|---------|------------|
| Официальные API | Reddit OAuth submit, X API v2, Telegram MTProto только для диалога с @mira |
| Один пост — один саб | Ротация по [`config/subreddits.yaml`](../config/subreddits.yaml), без дубликатов |
| Источник новости | RSS/JSON ingest; в посте ссылка на **первичный** URL, не копипаста статьи |
| AI | Явный дисклеймер в теле (Reddit) / в тексте или bio (X) |
| Affiliate | `t.me/mira?start=ref_...` = material connection; disclosure обязателен |
| Секреты | Только `token/`, `.env`; в git не коммитить |

---

## 2. Reddit

### 2.1 Аутентификация (текущая схема)

- User OAuth через **Devvit CLI** (`devvit login` → `token/reddit_token.json`).
- `client_id`: Devvit CLI; `client_secret`: пустой; refresh через `POST /api/v1/access_token`.
- Пост от имени пользователя (`u/c0s1nu7`), не отдельного «bot account» на prefs/apps.

**Риск:** client_id предназначен для Devvit-разработки; внешний cron на VPS — серая зона. Митигация: низкая частота, value-add, без кросс-поста.

### 2.2 Обязательные правила платформы

| Документ | Ссылка |
|----------|--------|
| Responsible Builder Policy | https://support.reddithelp.com/hc/en-us/articles/42728983564564 |
| Data API Terms | https://redditinc.com/policies/data-api-terms |
| Spam | https://support.reddithelp.com/hc/en-us/articles/360043504051 |
| Self-promotion | https://www.reddit.com/wiki/selfpromotion |

### 2.3 Чеклист перед каждым постом

- [ ] Текст **уникален** для этого саба (не постили тот же draft в другой sub за 72ч).
- [ ] Есть **ссылка на источник** новости (не только на Mira).
- [ ] Дисклеймер AI в теле self-post.
- [ ] Реф-ссылка Mira — только в сабах с `risk_promo: low/medium` или без неё в `very_high`.
- [ ] Заголовок не clickbait; соответствует теме саба.
- [ ] `User-Agent`: `MiraArticles/1.0 (by /u/<username>)`.

### 2.4 Rollout

См. `rollout_order` в [`config/subreddits.yaml`](../config/subreddits.yaml). Autopost в `technology` / `netsec` — последними.

Детали по сабам: [`subreddit-rules.md`](subreddit-rules.md) (в т.ч. **r/programming ban LLM content**).

---

## 3. X (Twitter)

### 3.1 Аутентификация

- **OAuth 1.0a user context** в `token/x_token.json` — **именно эти четыре поля** используются для `POST /2/tweets`:
  - `consumer_key` / `consumer_key_secret` (= API Key / Secret)
  - `access_token` / `access_token_secret` (= user tokens из портала)
- `client_id` / `client_secret` — **OAuth 2.0** (PKCE + refresh); для текущего теста `test:x` **не подставляются**; понадобятся, если перейдёте на OAuth 2 user flow.
- `bearer_key` — app-only read, **не** для постинга.

### 3.2 Правила

| Документ | Ссылка |
|----------|--------|
| Automation | https://help.x.com/en/rules-and-policies/x-automation |
| Developer Policy | https://developer.x.com/en/developer-terms/policy |
| Paid partnerships | https://help.x.com/en/rules-and-policies/paid-partnerships |

### 3.3 Чеклист

- [ ] Bio: указать automated / AI-assisted (если аккаунт ботоподобный).
- [ ] Реф Mira — в bio/pinned, не в каждом твите.
- [ ] ≤ ~5 постов / сутки (интервал 5ч).
- [ ] Нет @mention spam, нет одинаковых твитов.
- [ ] App permissions: **Read and write** в Developer Portal.

Тест API: `bun run scripts/test-x-post.ts`.

**Если 403 `oauth1-permissions`:** Developer Portal → App → **Settings** → User authentication → App permissions → **Read and write** → сохранить → **перевыпустить** Access Token & Secret (старые токены не подхватят новые права).

---

## 4. Telegram

| Документ | Ссылка |
|----------|--------|
| ToS | https://telegram.org/tos |
| API ToS | https://core.telegram.org/api/terms |

- `token/telegram.json` — `api_id`, `api_hash` (статично).
- `token/telegram.session` — **StringSession**, создаётся при первом интерактивном логине, в git не класть.
- Только диалог с `@mira`; интервал ≥ 5ч; обработка `FLOOD_WAIT`.

---

## 5. Контент и copyright

- Ingest: RSS/API, не HTML-scrape paywall.
- В промпт Mira: title + short summary + URL, без полного текста статьи.
- Цитаты — минимум, с атрибуцией.

---

## 6. FTC / disclosure (шаблоны)

**AI (Reddit / X):**
```
Частично подготовлено с помощью Mira (AI-ассистент в Telegram).
```

**Affiliate (если есть реф-ссылка в посте):**
```
Ссылка на Mira — реферальная; при регистрации автор поста может получить бонус.
```

---

## 7. Human review (рекомендация v1)

Первые 2–4 недели: `HUMAN_APPROVE=true` — черновик в Telegram/консоль, публикация после OK.

---

## 8. Инциденты

| Событие | Действие |
|---------|----------|
| Removal / ban в сабе | Стоп autopost в этот sub; разобрать причину в mod mail |
| 401 Reddit / X | Refresh token; проверить `token/*.json` |
| 403 X | Права app Read+Write; лимиты tier |
| Утечка токена | Revoke в портале, `devvit logout`, перевыпуск X keys |

---

## 9. Статус артефактов

| Артефакт | Файл |
|----------|------|
| Правила сабов | [`subreddit-rules.md`](subreddit-rules.md) |
| Протокол @mira | [`mira-bot-protocol.md`](mira-bot-protocol.md) |
| Источники новостей | [`news-sources.md`](news-sources.md) |
