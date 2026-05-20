# Telegram / @mira POC (фаза 1)

Проверено: `bun run telegram:login` → `bun run test:mira` (2026-05-20).

## Команды

| Команда | Назначение |
|---------|------------|
| `bun run telegram:login` | Интерактивный логин → `token/telegram.session` |
| `bun run test:mira` | Тестовый промпт к @mira, вывод `draftText` |
| `bun test` | Unit-тесты parser + credentials (без сети) |

## Файлы и секреты

| Путь | В git | Содержимое |
|------|-------|------------|
| `token/telegram.json` | нет | `api_id`, `api_hash` с [my.telegram.org/apps](https://my.telegram.org/apps) |
| `token/telegram.session` | нет | StringSession после login |
| `config/telegram.json.example` | да | шаблон формата |

`api_hash` — **ровно 32** hex-символа. Пустые `TELEGRAM_API_*=` в `.env` **перекрывают** JSON (см. `src/mira/credentials.ts`).

## Env

```bash
MIRA_BOT_USERNAME=mira          # default
MIRA_RESPONSE_TIMEOUT_MS=180000 # ожидание ответа бота (60–360s типично)
MIRA_POLL_INTERVAL_MS=2500      # backup poll getMessages; не ставить < 2000
```

## Известные особенности GramJS

### Username `mira` (4 символа)

`client.getEntity("mira")` падает: в GramJS `parseUsername` требует ≥5 символов.  
Решение: `resolveBotUser()` → `contacts.ResolveUsername` (`src/mira/client.ts`).

### NewMessage filter

Не передавать `Api.User` в `chats: [...]` — ошибка `[object Object]`.  
Используется `new NewMessage({ fromUsers: [botEntity.id] })`.

### FLOOD_WAIT на GetHistory

При опросе `getMessages` каждые **400ms** Telegram шлёт `FLOOD_WAIT ~19s` (шум в логах, тест всё равно проходит).  
С **2.5s** poll + event handler — flood редкий. Не уменьшать `MIRA_POLL_INTERVAL_MS` без нужды.

## Поток `sendPromptToMira`

1. `resolveBotUser` → `Api.User`
2. `sendMessage` с промптом
3. События `NewMessage` от бота + редкий `getMessages` (backup)
4. Завершение: нет новых сообщений **idleMs** (2.5s) или **totalTimeoutMs**
5. `mergeStreamingMessages` → `draftText`

Детали протокола бота: [`mira-bot-protocol.md`](mira-bot-protocol.md).

## Пример ответа (обезличенно)

Промпт: шаблон из §2 `mira-bot-protocol.md` (Linux 6.14-rc1).

Типичный ответ: заголовок + 2–4 абзаца + иногда «Короткий, живой…» / эмодзи; префикс «Вот пост:» — срезается в `cleanDraftText`.

## Следующий шаг

Фаза 2: [`IMPLEMENTATION.md`](IMPLEMENTATION.md) — RSS ingest, затем pipeline + Reddit.
