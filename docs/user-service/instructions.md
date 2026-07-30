# user-service — Instructions

## Локальный запуск

```bash
# из корня: docker compose up -d --build && .\scripts\bootstrap-db.ps1
docker compose up -d social-user-service user-db auth-db redis rabbitmq minio
```

После migrate нужна таблица `roles` (FK на `role_id=3`). `bootstrap-db.ps1` / `.sh` сидирует роли в `users_db` и `auth_db`. Без seed consumer `user.registered` падает с `ForeignKeyConstraintViolation`.

Standalone:

```bash
cd services/user-service
cp .env.example .env
npm install
npx prisma migrate deploy
npm run dev
```

## Критичные env

| Переменная | Назначение |
|------------|------------|
| `DATABASE_URL` | user_db |
| `AUTH_DATABASE_URL` | auth_db (password) |
| `REDIS_URL` | Кэш |
| `RABBITMQ_URL` | Event bus |
| `USER_EVENTS_EXCHANGE` | user.events |
| `S3_*` | MinIO/S3 для аватаров |
| `SMTP_*` | Отправка кода смены пароля |
| `MIN_SEARCH_QUERY_LENGTH` | Мин. длина поискового запроса |

## Ключевые endpoint'ы

### Профиль

- `GET /api/users/me` — свой профиль (auth)
- `PATCH /api/users/me` — обновление
- `GET /api/users/search?q=` — поиск
- `GET /api/users/me/avatar-upload-url` — presigned PUT URL

### Подписки

- `POST /api/followers/:id/follow`
- `DELETE /api/followers/:id/follow`
- `GET /api/followers/:id/followers`, `/following`, `/counts`

### Друзья

- `POST /api/friends/:id/request`
- `POST /api/friends/requests/:id/accept|cancel|decline`
- `DELETE /api/friends/:id` — удаление + переход в following
- `GET /api/friends/:id/relation` — агрегированный статус

### Пароль

- `POST /api/users/me/password/request` — код на email
- `POST /api/users/me/password/verify` — смена пароля + revoke refresh tokens

### Internal (S2S)

- `POST /api/users/internal/authors` — `{ userIds: number[] }`
- `POST /api/users/internal/feed-sources` — `{ userId }`
- `POST /api/users/internal/post-audience` — `{ userId }`

## Бизнес-логика (важное)

- **Friend request** автоматически создаёт follow на целевого пользователя.
- **Accept** создаёт friendship, удаляет встречные pending, убирает follow между сторонами.
- **Remove friend** удаляет friendship и upsert follow (initiator → target).
- **Кэш** инвалидируется при follow/friend/profile update.
- **Password:** 4-значный код, SHA-256 hash в `verification_codes`, bcrypt в `auth_accounts`.

## Consumer

`user.registered` → `UserProvisioningService.provisionFromRegistration` (upsert user по `userId`).

## Тесты

```bash
cd services/user-service
npm test
```
