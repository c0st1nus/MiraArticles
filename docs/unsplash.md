# Unsplash — иллюстрации к постам

Документация API: https://unsplash.com/documentation

## Обязательства (API Guidelines)

1. **Attribution** — в каждом использовании фото:
   - `Photo by {Photographer} on Unsplash` со ссылками на профиль автора и unsplash.com.
2. **Trigger download** — при сохранении/публикации изображения вызвать `GET` на `links.download_location` (с тем же `Client-ID`).
3. **Hotlinking** — использовать `urls.regular` / `urls.full` из ответа API, не кэшировать на свой CDN без правил Unsplash.
4. **Rate limit** — demo: **50 запросов/час** на `api.unsplash.com`; production: 1000/ч после [Apply for Production](https://unsplash.com/oauth/applications).

## Конфигурация

Секреты только в `.env` (см. `.env.example`):

```bash
UNSPLASH_ACCESS_KEY=   # Access Key из приложения
UNSPLASH_APP_ID=       # Application ID (опционально, для логов)
```

**Не коммитить ключи.** Если ключ попал в чат/git — ротировать в [Unsplash Developers](https://unsplash.com/oauth/applications).

## Использование в коде

```ts
import { attachIllustration } from "./pipeline/illustration";

const draft = { title: "Kubernetes 1.33 released", tags: ["devops", "kubernetes"] };
const withImage = await attachIllustration(draft);
// withImage.image?.attributionPlain — в footer Reddit
// withImage.image?.imageUrl — urls.regular для submit
```

## Платформы

| Платформа | Картинка |
|-----------|----------|
| **Reddit** | `kind=image` или gallery — проверить rules саба; иначе link + preview |
| **X** | `POST /2/media/upload` + tweet with media_ids |
| **Без картинки** | pipeline продолжает без `image` при ошибке API |

## Поисковый запрос

Из заголовка новости извлекаются ключевые слова (без стоп-слов). Fallback: `technology abstract minimal` (`config/unsplash.yaml`).
