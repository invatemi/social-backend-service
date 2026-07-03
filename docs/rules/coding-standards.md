# Стандарты кода

Правила для разработки в `social-backend-service` (Node.js + TypeScript + Express).

## Структура проекта

### Обязательные слои

1. **`routes/*/endpoints.ts`** — тонкий HTTP-слой: парсинг req, вызов service, `next(error)`.
2. **`routes/*/*.service.ts`** — бизнес-логика, валидация, работа с Prisma.
3. **`routes/*/*.errors.ts`** — доменные исключения с кодами.
4. **`middleware/error-handler.ts`** — маппинг доменных ошибок в HTTP.

### Запрещено

- Толстые контроллеры с SQL/Prisma-логикой напрямую в `endpoints.ts`.
- Глобальные синглтоны БД без инъекции через `req` (текущий паттерн: middleware attach `prisma` на request).

## TypeScript

- `strict: true` в `tsconfig.json`.
- Избегать `any`; для request extensions — явные интерфейсы (`KrakenDRequest`).
- DTO/Input типы рядом с service (`CreatePostData`, `UpdateProfileInput`).
- Приватные хелперы валидации — функции в том же файле service или отдельный `validators` при росте.

## Нейминг

| Элемент | Конвенция | Пример |
|---------|-----------|--------|
| Сервис (класс) | `PascalCase` + `Service` | `PostService` |
| Файл service | `kebab` или `dot` | `post.service.ts` |
| Ошибка | `PascalCase` + контекст | `PostNotFoundError` |
| Env переменная | `SCREAMING_SNAKE_CASE` | `DATABASE_URL` |
| Routing key | `domain.action` | `user.registered` |
| Cache key | `domain:entity:id` | `post:123` |

## Валидация входных данных

1. **HTTP body/query** — `zod` в `endpoints.ts` для сложных схем (user-service).
2. **Доменная валидация** — в service через приватные `validate*` функции (auth, post, comment).
3. Сообщения об ошибках — на английском в API response; логи могут быть на русском.

## Обработка ошибок

### Доменные ошибки

```typescript
export class PostNotFoundError extends PostError {
  constructor(postId: number) {
    super(`Post with id ${postId} not found`, 'POST_NOT_FOUND');
  }
}
```

### В endpoints

```typescript
try {
  const result = await service.doSomething();
  res.status(200).json({ success: true, ...result });
} catch (error) {
  next(error);
}
```

### В error-handler

Единый JSON:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "...",
    "field": "email"
  }
}
```

`user-service` дополнительно дублирует `message` на верхнем уровне — при новых endpoint'ах предпочитать единый формат из `api-conventions.md`.

## Prisma

- Один `PrismaClient` на процесс через `Database` wrapper (`config/database.ts`).
- Транзакции для связанных мутаций (`$transaction`).
- `select` только нужных полей в публичных ответах.
- Миграции — через `prisma migrate`; seed — `prisma/seed.ts` где есть.

## Event Bus

- Publish — fire-and-forget с `try/catch` и логом (не блокировать HTTP ответ из-за broker).
- Subscribe — в `consumers/`, регистрация при старте в `index.ts`.
- Payload — JSON, типизированные интерфейсы рядом с consumer.

## Redis

- Абстракция `cache.get/set/del/delPattern` в `middleware/redis.ts`.
- TTL из env (`*_CACHE_TTL_SECONDS`).
- Инвалидация при write — явные вызовы `invalidate*` (user-cache) или `delPattern` (post).

## Логирование

- `requestLogger` middleware на всех production-ready сервисах.
- `console.error` в error-handler с `[METHOD path]`.
- Не логировать пароли, токены, коды подтверждения.

## Тестирование

- Jest + ts-jest + supertest.
- Unit: mock Prisma, eventBus, cache, external HTTP.
- Integration: mock service layer или in-memory Express app.
- Скрипт: `npm test` в каждом сервисе.

## Git и изменения

- Один сервис — один логический PR при возможности.
- Обновлять `.env.example` при добавлении env.
- Не коммитить `.env` с секретами.
