# message-service — Instructions

## Локальный запуск

```bash
docker compose up -d social-message-service msg-db rabbitmq social-auth-service social-user-service minio minio-create-bucket
```

Standalone:

```bash
cd services/message-service
cp .env.example .env
npm install
npx prisma migrate deploy
npm run dev
```

## Критичные env

| Переменная | Назначение |
|------------|------------|
| `DATABASE_URL` | msg_db |
| `JWT_SECRET` / issuer / audience | user JWT |
| `AUTH_SERVICE_URL` | client credentials |
| `SERVICE_CLIENT_ID` / `SECRET` | `message-service` |
| `USER_SERVICE_URL` | авторы |
| `RABBITMQ_URL` | события |
| `MESSAGE_EVENTS_EXCHANGE` | `message.events` |
| `S3_*` | MinIO (endpoint, bucket, keys, public/upload URL) |
| `MAX_ATTACHMENT_BYTES` | лимит размера (default 20 MB) |
| `MAX_ATTACHMENTS_PER_MESSAGE` | лимит числа (default 5) |

## Endpoint'ы

| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| GET | `/health` | нет | статус + БД |
| GET | `/api/messages/chats` | JWT | список чатов |
| POST | `/api/messages/chats` | JWT | создать/вернуть 1–1 |
| DELETE | `/api/messages/chats/:chatId` | JWT | удалить чат |
| GET | `/api/messages/chats/:chatId/upload-url` | JWT | presigned PUT для вложения |
| GET | `/api/messages/chats/:chatId/attachments` | JWT | фото/файлы чата |
| GET | `/api/messages/:chatId` | JWT | сообщения; обновляет `lastReadAt` |
| POST | `/api/messages/send` | JWT | текст и/или вложения |

### Контракт фронта

- Lists: `{ message, data, pagination: { limit, offset } }`
- `POST /chats` и `POST /send` — **flat** body (`ChatData` / `MessageData`)
- `MessageData.attachments[]` — всегда в ответах истории/send/realtime
- Upload flow: `GET upload-url` → client `PUT` в MinIO → `POST /send` с `attachments: [{ url, fileName, mimeType, sizeBytes, objectKey }]`
- `content` может быть пустым, если есть хотя бы одно вложение

### Создание чата

Idempotent для DM: если пара участников уже есть — возвращается существующий чат.

## Realtime

Публикация в `message.events` → consumers notifications → Socket.IO в **user rooms**:

- `message:new` (включая `attachments`)
- `chat:created` (`participantIds`)
- `chat:deleted`

## Docker

Build context — **корень репо** (`services/message-service/Dockerfile`), нужен `shared/security`.

```bash
docker compose build social-message-service
docker compose up -d social-message-service
docker compose exec -T social-message-service npx prisma migrate deploy
```

В корневом `.env` нужны `SERVICE_CLIENT_MESSAGE_SERVICE_ID/SECRET` и `S3_*`.

## Troubleshooting

| Проблема | Действие |
|----------|----------|
| Пустые имена/аватары | auth registry + `SERVICE_CLIENT_MESSAGE_*` |
| Нет realtime | RabbitMQ definitions (`message.events`), notifications queues |
| 401 на API | JWT через KrakenD, middleware user-context |
| Upload 403/CORS | MinIO CORS, `S3_UPLOAD_ENDPOINT`, `S3_PUBLIC_BASE_URL` |
| Вложения не сохраняются | migrate `message_attachments`, префикс `messages/{chatId}/` в `objectKey` |
