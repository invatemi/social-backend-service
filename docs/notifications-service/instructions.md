# notifications-service — Instructions

## Локальный запуск

```bash
docker compose up -d social-notifications-service notif-db rabbitmq
```

Standalone:

```bash
cd services/notifications-service
cp .env.example .env
npm install
npx prisma migrate deploy
npm run dev
```

## Критичные env

| Переменная | Назначение |
|------------|------------|
| `DATABASE_URL` | notif_db |
| `RABBITMQ_URL` | Брокер |
| `USER_EVENTS_EXCHANGE` | Подписка на user события |
| `POST_EVENTS_EXCHANGE` | Подписка на post события |
| `JWT_SECRET` | Socket.IO handshake |
| `USER_SERVICE_URL` | HTTP к user-service (audience) |

## REST API

Все endpoint'ы требуют `x-user-id` (через KrakenD).

### Примеры

```http
GET /api/notifications?unreadOnly=true
PATCH /api/notifications/42/read
PATCH /api/notifications/read-all
```

Ответ списка:

```json
{
  "success": true,
  "notifications": [],
  "total": 0
}
```

## Consumers (при старте)

Регистрируются в `src/index.ts`:

- `user-events.consumer` — friend, follow, user.updated, photo.*
- `post-created/updated/deleted/liked`
- `comment-created/updated/deleted`
- `message-events.consumer` — message.created/updated/deleted, chat.created/deleted/read

При валидном payload — запись в БД (где нужно) + Socket emit.

## Socket.IO

Инициализация: `initSocketHub(httpServer)` в `index.ts`.

- JWT на connect; комнаты `user:{id}`, `chat:{id}`
- Presence: `presence:check` (max 100 ids) регистрирует watchers; `user:online`/`user:offline` только им
- При `REDIS_URL` — `@socket.io/redis-adapter` + Redis set `socket:online_users` для multi-instance
- Клиентские notification-каналы: `notification:friend_request`, и т.д.

## Типы уведомлений (персистентные)

См. `sse-event-mapper.ts`: `FRIEND_REQUESTED`, `FRIEND_ACCEPTED`, `FOLLOW_CREATED`, `USER_UPDATED`, и др.

## Тесты

```bash
cd services/notifications-service
npm test
```

## Troubleshooting

| Проблема | Действие |
|----------|----------|
| Нет realtime | Проверить JWT на socket, логи consumers |
| Пустые уведомления при событиях | RabbitMQ bindings, exchange names в env |
| 401 на REST | Gateway должен пробрасывать `x-user-id` |
