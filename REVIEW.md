## Review — 2026-05-20 — Phase 4 Reddit Publisher

### Автоматические проверки
- bun test: ✅ 65 pass, 0 fail (15 reddit tests)
- tsc: не настроен отдельно, Bun types clean

---

### ✅ Хорошо
- `refreshAccessToken` — правильный Basic Auth с пустым secret (`clientId:`), endpoint `https://www.reddit.com/api/v1/access_token` ✅
- `submitSelfPost` — submit на `oauth.reddit.com/api/submit`, правильный Bearer header ✅
- `publishDraftToReddit` — `REDDIT_ENABLED` guard, `programming` block, `subredditOverride` / `REDDIT_TEST_SR` ✅
- Post-submit: `insertPublished` + `updateDraftStatus("published")` + `markPublished(url)` — все три вызова есть ✅
- Ошибки записи в DB после успешного post — не проваливают publish (catch → logError) ✅
- Нет токенов в логах основных модулей (reddit.ts, reddit-auth.ts) ✅
- `reddit:test` script в package.json ✅
- Тест-покрытие: все guards, sr-stripping, DB-side-effects, API errors — хорошо ✅

---

### Исправлено после ревью

- HUMAN_APPROVE gate: `validated` | `pending_approve` при `HUMAN_APPROVE=true` ✅
- Token log leak в smoke script убран ✅

---

### ⚠️ Замечания (не блокируют)

1. **`insertPublished` canonicalUrl семантика** — в reddit.ts передаётся `canonicalUrl: result.url` (URL Reddit-поста). Колонка называется `canonical_url` — если под этим подразумевается URL новостной статьи, это баг. Если Reddit-пост URL — ок, но стоит переименовать параметр/колонку в `postUrl` для ясности.

2. **`makeTokenFetch` в тестах** — `callCount` объявлен но нигде не используется (`src/publishers/reddit.test.ts:37`). Мёртвый код.

3. **`updateDraftStatus` принимает `status: string`** (`src/pipeline/store.ts:246`) — не типизирован против `DraftStatus` union. Можно передать любую строку. Рекомендую сузить тип.

---

### Вердикт

**APPROVE**
