# Правила целевых сабреддитов

Снимок через Reddit `about/rules.json` (2026-05). Перед постом сверяйте актуальные rules в UI.

| Саб | Rules URL |
|-----|-----------|
| r/programming | https://www.reddit.com/r/programming/about/rules |
| r/linux | https://www.reddit.com/r/linux/about/rules |
| r/opensource | https://www.reddit.com/r/opensource/about/rules |
| r/technology | https://www.reddit.com/r/technology/about/rules |
| r/sysadmin | https://www.reddit.com/r/sysadmin/about/rules |
| r/devops | https://www.reddit.com/r/devops/about/rules |
| r/netsec | https://www.reddit.com/r/netsec/about/rules |
| r/selfhosted | https://www.reddit.com/r/selfhosted/about/rules |

---

## Критично для MiraArticles

### r/programming — ⚠️ почти не подходит для AI-бота

- **No LLM-Written Content** — «If you don't want to write it, we don't want to read it» (включая перевод/summary через LLM).
- **No LLM-related posts** — LLM-контент любого рода banned.
- No product promotion / «I made this» demo posts.
- **Вывод:** автопосты с текстом от Mira **высокий риск removal**. Только ручная доработка человеком или **исключить** из rollout.

### r/netsec — строго

- Оригинальный источник, технический контент, без commercial advertisement.
- Дубликаты в new queue удаляют.
- **Вывод:** глубокий разбор + ссылка на advisory; без реф Mira в теле; autopost — последним.

### r/technology

- Заголовок **строго** с статьи; submissions about technology; no sensationalized titles.
- **Вывод:** link-post или self с точным title; very_high promo risk.

### r/devops

- Пост не «просто ссылка» — нужен **комментарий/контекст** в submission.
- Self-promo → weekly thread; affiliation disclose.
- **Вывод:** self-post с 2–3 абзацами своего комментария, не голая RSS-заготовка.

### r/selfhosted — лучший старт

- On-topic self-hosting; spam/affiliate ограничены, но megathread для new projects.
- Blog links — с объяснением, не только URL.
- **Вывод:** первый саб для тестов; реф Mira осторожно.

### r/linux / r/opensource

- No spamblog; relevance; self-promo 9:1 (opensource явно).
- **Вывод:** оригинальный source URL; уникальный комментарий.

### r/sysadmin

- Account age 24h+; no advertising (sidebar ads only).
- **Вывод:** практический угол; без vendor pitch.

---

## Матрица: можно ли постить draft от Mira как есть?

| Саб | Autopost Mira draft | Реф-ссылка в теле | Примечание |
|-----|---------------------|-------------------|------------|
| selfhosted | ⚠️ с human edit | осторожно | старт здесь |
| linux | ⚠️ | нет в v1 | source + commentary |
| opensource | ⚠️ | нет | on-topic FOSS |
| devops | ⚠️ | нет | обязателен commentary block |
| sysadmin | ⚠️ | нет | enterprise angle |
| programming | ❌ | ❌ | **LLM ban** |
| netsec | ❌/ручной | ❌ | technical depth |
| technology | ❌/ручной | ❌ | title from article |

---

## Рекомендации pipeline

1. Mira генерирует **черновик** → human optional → **перефразирование** для r/programming не спасёт от LLM rule, если модераторы считают контент LLM-written.
2. Для r/programming: **не использовать** в autopost; только ручные посты без LLM-текста или исключить саб.
3. Disclosure AI не отменяет r/programming LLM ban.

См. также [`compliance.md`](compliance.md), [`config/subreddits.yaml`](../config/subreddits.yaml).
