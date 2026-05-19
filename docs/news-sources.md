# Источники быстрых IT-новостей

Цель: находить сюжеты **раньше**, чем они «протухнут» на r/technology, и писать **свой** пост со ссылкой на первоисточник (не копипаста RSS-текста).

Конфиг для парсера: [`config/sources.yaml`](../config/sources.yaml).

---

## Как измерять «скорость»

| Уровень | Типичный лаг | Примеры |
|---------|--------------|---------|
| **S** | 5–60 мин | OpenNet mini, HN newest, Lobsters, TechMeme |
| **A** | 1–6 ч | Phoronix, BleepingComputer, The Register Security |
| **B** | 6–24 ч | Ars, LWN, Habr (редакция) |
| **C** | 1–3 дня | Мейнстрим СМИ |

Для цикла **5 часов** достаточно Tier **S + A**. Tier B — fallback, если нет свежего S.

---

## Tier S — самые быстрые (рекомендуется для ingest)

### Русскоязычные

| Источник | RSS / API | Лаг | Лучше для сабов |
|----------|-----------|-----|-----------------|
| **[OpenNet](https://www.opennet.ru/)** — эталон скорости RU | [все новости](https://www.opennet.ru/opennews/opennews_all_noadv.rss), [мини](https://www.opennet.ru/opennews/opennews_mini_noadv.rss), [wiki RSS](http://wiki.opennet.ru/RSS) | минуты | r/linux, r/netsec, r/opensource |
| **Habr** (комментарии быстрее статей) | `https://habr.com/ru/rss/all/all/` | часы | r/programming, r/devops |
| **SecurityLab** | `https://www.securitylab.ru/_services/export/rss/` | часы | r/netsec |
| **IXBT / 3DNews** | есть RSS | часы | скорее r/technology (слабый fit) |

OpenNet часто публикует **раньше** переводов западных CVE и патчей — идеален как «радар», ссылку в Reddit всё равно ставить на **первичный** URL из заметки OpenNet (vendor advisory, GitHub, NVD).

### Англоязычные агрегаторы / форумы

| Источник | RSS | Лаг | Лучше для сабов |
|----------|-----|-----|-----------------|
| **Hacker News (newest)** | https://hnrss.org/newest | минуты | r/programming, r/technology |
| **Lobste.rs** | https://lobste.rs/newest.rss , https://lobste.rs/hottest.rss | минуты | r/programming, r/linux, r/netsec |
| **TechMeme** | https://www.techmeme.com/feed.xml | минуты (агрегация) | r/technology |
| **SoylentNews** | http://soylentnews.org/index.rss | часы | r/technology, r/linux |
| **Slashdot** | https://slashdot.org/index.rss | часы | r/technology |

**Форумы** (не RSS, но быстрые обсуждения — только для **выбора угла**, не для scrape): threads на Lobsters/HN после появления ссылки.

### Security-first (для r/netsec, r/sysadmin)

| Источник | RSS | Лаг | Заметка |
|----------|-----|-----|---------|
| **BleepingComputer** | https://www.bleepingcomputer.com/feed/ | часы | массовые инциденты, patches |
| **The Hacker News** | FeedBurner в конфиге | часы | не путать с HN |
| **The Register Security** | Atom security headlines | часы | с юмором, но быстро |
| **Packet Storm** | https://packetstormsecurity.com/feeds/ | часы | агрегатор |
| **CVE / KEV** | [CISA KEV JSON](https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json), [cvefeed.io](https://cvefeed.io/rssfeed/) | 15 мин – часы | сухие факты; пост нужен **глубокий** для r/netsec |
| **GitHub Security Advisories** | [API](https://docs.github.com/en/rest/security-advisories) | минуты–часы | r/netsec, r/devops, r/programming |

### Linux / OSS / infra

| Источник | RSS | Лаг | Сабы |
|----------|-----|-----|------|
| **Phoronix** | https://www.phoronix.com/rss.php | часы | r/linux |
| **LWN headlines** | https://lwn.net/headlines/rss | дни (глубина) | r/linux, r/programming |
| **LinuxSecurity advisories** | см. сайт | часы | r/linux, r/netsec |
| **DistroWatch** | https://distrowatch.com/news/dwd.xml | часы | r/linux (релизы) |
| **Kubernetes / Docker / GitHub blog** | см. `sources.yaml` | часы | r/devops, r/selfhosted |

---

## Telegram / Twitter (только как «радар»)

OpenNet дублирует RSS в [@opennet_ru](https://t.me/opennet_ru) — для автоматизации **достаточно RSS**, TG не обязателен.

Если всё же читать TG каналы через MTProto: только **публичные** каналы, без массового scraping, лучше дублировать RSS где есть.

---

## Маршрутизация новость → сабреддит

Не «одна новость → 8 сабов». Алгоритм:

1. Ingest из Tier S (все фиды параллельно).
2. Dedup по URL каноническому (не по заголовку перевода).
3. Классификация тегов: `security`, `linux`, `k8s`, `selfhosted`, …
4. Выбор **одного** саба по таблице:

| Тег / сигнал | Сабреддит |
|--------------|-----------|
| CVE, exploit, malware, RCE | r/netsec |
| kernel, distro, wayland, driver | r/linux |
| license, foundation, FOSS release | r/opensource |
| k8s, terraform, CI, incident postmortem | r/devops |
| enterprise patch Tuesday, AD, Windows server | r/sysadmin |
| homelab, Nextcloud, Immich, self-hosted SaaS | r/selfhosted |
| язык, фреймворк, paper, tooling | r/programming |
| big tech, policy, consumer | r/technology (последний в очереди) |

5. Ротация: если последний пост был в r/linux, следующий цикл — другой саб при равном score.

---

## Сабреддиты: культура и риск для MiraArticles

| Саб | Аудитория | Риск бана (promo + AI) | Что заходит |
|-----|-----------|------------------------|-------------|
| **r/selfhosted** | homelab | средний | релизы self-hosted, гайды, «я поднял X» |
| **r/linux** | OSS/desktop | средний | kernel, distro news, Phoronix-уровень |
| **r/opensource** | FOSS | средний | лицензии, крупные релизы, governance |
| **r/devops** | SRE | средний–высокий | incidents, tooling, не маркетинг |
| **r/sysadmin** | enterprise | высокий | практика, patch, career — без affiliate |
| **r/programming** | dev | высокий | качество текста, не blogspam |
| **r/netsec** | security | **очень высокий** | только тех. разбор; [правила строгие](https://www.reddit.com/r/netsec/about/rules) |
| **r/technology** | массовый | **очень высокий** | часто удаляют bots/spam; нужен уникальный угол |

**Практика:** старт с **r/selfhosted** или **r/linux**; r/technology и r/netsec — только после стабильных постов без removal.

Реф-ссылку Mira в теле поста — в сабах с высоким риском лучше **убрать** и оставить только в профиле Reddit + disclosure AI.

---

## Юридически безопасный ingest

- Тянуть **RSS/JSON**, не HTML-scrape (уважать `robots.txt` и ToS сайта).
- В БД хранить: title, url, publishedAt, source_id — **не** полный текст статьи.
- В промпт Mira передавать: заголовок + 1–2 предложения из RSS description + URL.
- Итоговый пост — **пересказ** + ссылка на оригинал.

---

## Рекомендуемый MVP-набор фидов (8 штук)

1. `opennet_mini` + `opennet_all`
2. `hnrss.org/newest`
3. `lobste.rs/newest.rss`
4. `techmeme.com/feed.xml`
5. `phoronix.com/rss.php`
6. `bleepingcomputer.com/feed/`
7. `theregister.com/security` atom
8. `cisa.gov` KEV JSON (poll раз в час)

Остальное — по мере стабилизации парсера.
