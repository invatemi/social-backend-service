# API-конвенции

Правила проектирования HTTP API для `social-backend-service`.

## Базовый URL

Внешний клиент обращается к **KrakenD** (по умолчанию `http://localhost:8080`). Gateway проксирует к внутренним сервисам.

| Префикс | Сервис |
|---------|--------|
| `/api/auth` | auth-service |
| `/api/users` | user-service |
| `/api/followers` | user-service |
| `/api/friends` | user-service |
| `/api/posts` | post-service |
| `/api/comments` | post-service |
| `/api/messages` | message-service |
| `/api/notifications` | notifications-service |

## Аутентификация

### Токены (SPA + HttpOnly cookie)

| Токен | Где хранится | Как передаётся |
|-------|--------------|----------------|
| Access token | Память клиента (Redux) | `Authorization: Bearer <accessToken>` |
| Refresh token | HttpOnly cookie `refreshToken` | Автоматически браузером на `/api/auth/*` |

**Login / Register** (`200`):
```json
{
  "accessToken": "...",
  "user": { "id": 1, "username": "...", "email": "...", "role": "user" }
}
```
+ `Set-Cookie: refreshToken=...; HttpOnly; Path=/api/auth; SameSite=Lax`

**Refresh** (`POST /api/auth/refresh`, без body):
```json
{ "accessToken": "..." }
```
+ ротация refresh cookie в `Set-Cookie`

**Logout** (`POST /api/auth/logout`): удаляет refresh из БД и очищает cookie.

**CORS (KrakenD):** `allow_credentials: true`, конкретные origins (не `*`), клиент использует `credentials: 'include'`.

### Публичные endpoint'ы (без JWT)

Примеры: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/posts`, `GET /api/posts/:id`.

### Защищённые endpoint'ы

1. Клиент отправляет `Authorization: Bearer <accessToken>` на KrakenD.
2. Gateway валидирует JWT (JWKS от auth-service) и пробрасывает `Authorization` в downstream.
3. Gateway может дополнительно пробрасывать `x-user-id` / `x-user-role` (обратная совместимость).
4. Сервис использует `userContextMiddleware` (`shared/security`): повторно валидирует JWT, извлекает `userId`/`role` из токена.
5. Если `x-user-id` присутствует и не совпадает с JWT → `403 Forbidden: identity mismatch`.

### Ошибки user context middleware

| Ситуация | HTTP | Тело |
|----------|------|------|
| Нет `Authorization` | 401 | `{ success: false, message: "Unauthorized: missing token" }` |
| Истёкший JWT | 401 | `{ success: false, message: "Unauthorized: token expired" }` |
| Невалидный JWT | 403 | `{ success: false, message: "Forbidden: invalid token" }` |
| `x-user-id` не совпадает с JWT | 403 | `{ success: false, message: "Forbidden: identity mismatch" }` |

## Формат успешного ответа

Рекомендуемый контракт (используется в большинстве сервисов):

```json
{
  "success": true,
  "post": { },
  "user": { },
  "notifications": [ ],
  "total": 0
}
```

Auth-service (legacy, без `success` на части endpoint'ов):

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": { }
}
```

При добавлении новых endpoint'ов — всегда включать `success: true`.

## Формат ошибки

Стандарт (auth, post, user, notifications):

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "field": "email"
  }
}
```

`user-service` также возвращает `message` на корневом уровне — для совместимости с фронтом.

## HTTP статус-коды

| Код | Когда |
|-----|-------|
| 200 | Успешное чтение/мутация |
| 201 | Создание ресурса (friend request) |
| 400 | Валидация, self-follow, короткий пароль |
| 401 | Неверные credentials, invalid refresh token, нет gateway context |
| 403 | Нет прав на ресурс (чужой пост/комментарий) |
| 404 | Ресурс не найден (post, user, comment, friend request) |
| 409 | Конфликт (user exists, already following, already published) |
| 410 | Удалённый комментарий (редко) |
| 429 | Превышен rate limit (auth login/register) |
| 500 | Необработанная ошибка |
| 503 | БД недоступна (health, message-service) |

## Коды ошибок (error.code)

### Auth

`VALIDATION_ERROR`, `USER_EXISTS`, `INVALID_CREDENTIALS`, `INVALID_REFRESH_TOKEN`, `RATE_LIMIT_EXCEEDED`

### Post / Comment

`VALIDATION_ERROR`, `POST_NOT_FOUND`, `COMMENT_NOT_FOUND`, `FORBIDDEN`, `POST_ALREADY_PUBLISHED`, `POST_ALREADY_DRAFT`

### User / Followers / Friends

`USER_NOT_FOUND`, `SELF_FOLLOW`, `ALREADY_FOLLOWING`, `NOT_FOLLOWING`, `SELF_FRIEND`, `NOT_FRIENDS`, `ALREADY_FRIENDS`, `FRIEND_REQUEST_ALREADY_EXISTS`, `FRIEND_REQUEST_NOT_FOUND`

### Password

`INVALID_CODE`, `CODE_EXPIRED`, `VALIDATION_ERROR`, `USER_NOT_FOUND`

### Notifications

`VALIDATION_ERROR`, `INTERNAL_ERROR`

### JSON parse

`INVALID_JSON` — невалидное тело запроса (`json-error-handler`).

## Rate limiting (auth-service)

Публичные auth endpoint'ы ограничены по IP (с учётом `X-Forwarded-For` через KrakenD).

| Endpoint | Лимит по умолчанию |
|----------|-------------------|
| `POST /api/auth/login` | 5 запросов / минута |
| `POST /api/auth/register` | 3 запроса / час |

При превышении:

- HTTP `429`
- Заголовки: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` (секунды)
- Тело:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later."
  }
}
```

Хранилище счётчиков — in-memory (single instance). Для кластера — Redis (`rate-limit-redis`).

## Пагинация

### Offset (post-service)

Query: `page`, `pageSize` (1–100).

Ответ: `posts`, `total`, `page`, `pageSize`, `totalPages`.

### Cursor (user-service)

Query: `limit`, `cursor`.

Ответ: `nextCursor`, `total`.

## Internal API (service-to-service)

Префикс: `/api/users/internal/*`

| Endpoint | Назначение |
|----------|------------|
| `POST /internal/authors` | Batch авторов постов |
| `POST /internal/feed-sources` | ID пользователей для ленты |
| `POST /internal/post-audience` | Аудитория realtime для постов |

**Аутентификация:** Service JWT (Client Credentials).

1. Caller (`post-service`, `notifications-service`) запрашивает токен: `POST /api/auth/internal/token` (только в `backend-net`, не в KrakenD).
2. Body: `{ "client_id", "client_secret", "audience": "user-service" }`.
3. Вызов internal API: `Authorization: Bearer <service-jwt>`.
4. `user-service` валидирует `typ: service`, `aud: user-service`, scope `internal:users:read`.

**Feature flag:** `INTERNAL_API_AUTH_ENABLED=false` отключает проверку (только для поэтапной миграции; логируется warning).

**Исключения без auth:** `GET /health`, `GET /metrics` (зарезервировано), публичные auth routes (`/api/auth/register`, `/login`, `/jwks`, …).

## WebSocket (notifications)

Socket.IO на notifications-service. Аутентификация через JWT при handshake (см. `socket-hub.ts`). События маппятся из `sse-event-mapper.ts` (`notification:friend_request`, `user:profile_updated`, и т.д.).

## Версионирование

Текущая версия API — **неявная v1** (без префикса `/v1`). Breaking changes — через новые поля (additive) или согласованный мажорный релиз с версией в path.

## Health

`GET /health` на каждом сервисе (и через gateway при настройке).

```json
{
  "status": "healthy",
  "service": "social-post-service",
  "database": "connected"
}
```
