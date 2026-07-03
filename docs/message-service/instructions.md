# message-service — Instructions

## Локальный запуск

```bash
docker compose up -d social-message-service msg-db
```

Standalone:

```bash
cd services/message-service
cp .env.example .env
npm install
npm run dev
```

## Критичные env

| Переменная | Назначение |
|------------|------------|
| `DATABASE_URL` | msg_db connection string |
| `PORT` | HTTP порт (3004) |
| `HOST` | Bind address |
| `DB_CONNECT_MAX_ATTEMPTS` | Retry подключения к БД |
| `DB_CONNECT_RETRY_DELAY_MS` | Задержка между попытками |

## Доступные endpoint'ы

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/health` | `{ status: "ok", service, port }` |
| GET | `/api/users` | Сырой SELECT из таблицы users (dev) |

## Особенности

- Подключение к БД с retry в фоне (`connectWithRetry`).
- При недоступной БД `/api/users` → `503 { error: "Database unavailable" }`.
- **Нет** JWT/KrakenD middleware в текущем коде — не использовать как production API для клиента без доработки.

## Следующие шаги для разработчика

1. Добавить `src/config/health.ts`, `lifecycle.ts` по образцу auth-service.
2. Ввести `routes/` + `*.service.ts` для чатов и сообщений.
3. Подключить `krakend-auth` для защищённых маршрутов.
4. Определить схему Prisma в `prisma/schema.prisma` и миграции.
5. При realtime — рассмотреть Socket.IO или отдельный channel через notifications-service.

## Docker

Сервис `social-message-service` в корневом `docker-compose.yml`, зависит от `msg-db`.
