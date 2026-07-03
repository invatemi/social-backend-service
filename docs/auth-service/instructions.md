# auth-service — Instructions

## Локальный запуск

### Через Docker Compose (рекомендуется)

```bash
# из корня social-backend-service
cp .env.example .env
# заполнить JWT_SECRET, SERVICE_JWT_SECRET, RABBITMQ_*, пароли БД
docker compose up -d social-auth-service rabbitmq auth-db
```

### Standalone

```bash
cd services/auth-service
cp .env.example .env
npm install
npx prisma migrate deploy
npm run dev
```

## Критичные переменные окружения

| Переменная | Назначение |
|------------|------------|
| `DATABASE_URL` | PostgreSQL auth_db |
| `RABBITMQ_URL` | Подключение к брокеру |
| `JWT_SECRET` | Подпись user access token (не использовать для service JWT) |
| `SERVICE_JWT_SECRET` | Подпись service-to-service JWT (отдельный секрет, не в JWKS) |
| `JWT_ISSUER` | Claim `iss` для user JWT (`social-auth-service`) |
| `JWT_AUDIENCE` | Claim `aud` для user JWT (`social-api`) |
| `JWT_CLOCK_TOLERANCE_SEC` | Допуск рассинхрона часов при verify |
| `JWT_CLAIMS_STRICT` | `true` — жёстко требовать `typ`/`iss`/`aud`; `false` — graceful migration |
| `SERVICE_JWT_TTL_SEC` | TTL service token (по умолчанию `300`) |
| `ACCESS_TOKEN_KEY_ID` | `kid` в JWT / JWKS |
| `ACCESS_TOKEN_EXPIRY` | TTL access token (например `15m`) |
| `REFRESH_TOKEN_BYTES` | Длина refresh token (hex = bytes * 2) |
| `REFRESH_TOKEN_PEPPER` | Секрет для lookup-хэша refresh token (мин. 32 символа, отдельно от `JWT_SECRET`) |
| `USER_EVENTS_EXCHANGE` | Exchange для `user.registered` |
| `BCRYPT_SALT_ROUNDS` | Хеширование пароля |
| `DEFAULT_USER_ROLE_ID` | roleId при регистрации |

Полный список: `services/auth-service/.env.example`.

## Основные сценарии

### Регистрация

1. `POST /api/auth/register` с `username`, `email`, `password`.
2. Создаётся `auth_account`, выдаются токены.
3. Публикуется `user.registered` → `user-service` создаёт профиль.

### Вход

`POST /api/auth/login` → `{ accessToken, refreshToken, user }`.

### Refresh

`POST /api/auth/refresh` с `refreshToken`. Старый refresh удаляется, выдаётся новая пара.

### Logout

`POST /api/auth/logout` с `refreshToken` — удаление из БД.

## Бизнес-правила

- Email нормализуется (lowercase, trim).
- Пароль и username валидируются по `MIN_PASSWORD_LENGTH`, `MIN_USERNAME_LENGTH`.
- Refresh token: проверка длины и срока `expiresAt`; в БД хранится только SHA-256 хэш + соль (plaintext — в HttpOnly cookie).
- При ошибке publish `user.registered` регистрация **не откатывается** (логируется ошибка).

## Health

`GET /health` — статус сервиса и подключения к БД.

## Тесты

```bash
cd services/auth-service
npm test
```

## Troubleshooting

| Проблема | Действие |
|----------|----------|
| KrakenD не валидирует JWT | Проверить `GET /api/auth/jwks`, `JWT_SECRET` в gateway и auth |
| Пользователь не появляется в user-service | Проверить RabbitMQ, consumer в user-service |
| 401 на refresh | Токен истёк или неверная длина |

## Миграция JWT boundary

Рекомендуемый порядок деплоя:

1. Добавить в `.env`: `SERVICE_JWT_SECRET` (новый, отличный от `JWT_SECRET`), `JWT_ISSUER`, `JWT_AUDIENCE`, оставить `JWT_CLAIMS_STRICT=false`.
2. Задеплоить `auth-service`, затем downstream-сервисы и KrakenD (`node krakend/generate-tmpl.js`).
3. Подождать истечения access TTL (`ACCESS_TOKEN_EXPIRY`, обычно 15m).
4. Установить `JWT_CLAIMS_STRICT=true` и перезапустить user/post/notifications-service.

Принудительный logout всех сессий (опционально, мгновенный cutover):

```sql
DELETE FROM refresh_tokens;
```

## QA чеклист (JWT boundary)

```bash
# User token
USER_TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"...","password":"..."}' | jq -r .accessToken)

# Service token
SERVICE_TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/internal/token \
  -H "Content-Type: application/json" \
  -d '{"client_id":"post-service","client_secret":"...","audience":"user-service"}' \
  | jq -r .access_token)

# 1. Service JWT на user endpoint → 403
curl -i -H "Authorization: Bearer $SERVICE_TOKEN" http://localhost:8080/api/users/me

# 2. User JWT на internal API → 403
curl -i -H "Authorization: Bearer $USER_TOKEN" \
  http://localhost:3002/api/users/internal/batch-authors

# 3. Spoofed x-user-id → 403
curl -i -H "Authorization: Bearer $USER_TOKEN" -H "x-user-id: 999" \
  http://localhost:8080/api/users/me

# 4. Valid user flow → 200
curl -i -H "Authorization: Bearer $USER_TOKEN" http://localhost:8080/api/users/me
```

Проверки algorithm confusion (`none`, `RS256`) — отправить подделанный JWT на protected route; ожидается `403 Forbidden: invalid token`.
