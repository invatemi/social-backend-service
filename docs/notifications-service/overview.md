# notifications-service — Overview

## Назначение

`notifications-service` — **уведомления и realtime**: хранение in-app notifications, доставка через Socket.IO, реакция на события user / post / message доменов.

## Зона ответственности

- REST API: список уведомлений, mark read / read all
- Персистентность в `notifications` table (+ prune старых строк)
- Consumers RabbitMQ (`user.events`, `post.events`, `message.events`)
- Realtime push через Socket.IO (`socket-hub`)
- Presence: watcher-scoped online/offline (не global broadcast); Redis adapter + shared online set при `REDIS_URL`
- Маппинг типов уведомлений в SSE-события (`sse-event-mapper`)

## Зависимости

| Тип | Компонент |
|-----|-----------|
| БД | PostgreSQL `notif_db` (Prisma) |
| Broker | RabbitMQ (`user.events`, `post.events`, `message.events`) |
| Cache / scale | Redis (Socket.IO adapter, presence set) |
| HTTP | user-service (аудитория постов) |
| Realtime | Socket.IO |

## Связи

```mermaid
flowchart LR
  UserSvc[user-service] -->|user.* events| MQ[RabbitMQ]
  PostSvc[post-service] -->|post.* comment.*| MQ
  MsgSvc[message-service] -->|message.* chat.*| MQ
  MQ --> Notif[notifications-service]
  Notif --> DB[(notif_db)]
  Notif --> Redis[(Redis)]
  Notif --> WS[Socket.IO clients]
```

## API

Префикс `/api/notifications`:

- `GET /` — список (`?unreadOnly=true`, take ≤ 100)
- `PATCH /:id/read` — прочитать одно
- `PATCH /read-all` — прочитать все

## Порт

- По умолчанию: `3005`
- `SERVICE_NAME=social-notifications-service`
