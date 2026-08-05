# message-service — Overview

## Назначение

`message-service` управляет **личными чатами и сообщениями**: inbox, создание 1–1 чата, история, отправка текста и вложений, realtime через RabbitMQ → notifications Socket.IO.

## Зона ответственности

- CRUD чатов и сообщений в `msg_db`
- Вложения (фото/файлы) через MinIO: presigned PUT → метаданные в `message_attachments`
- Обогащение участников/авторов через user-service (`/api/users/internal/authors`)
- События `message.created`, `chat.created`, `chat.deleted`, `chat.read` в exchange `message.events`
- Read-state: обновление `lastReadAt` при `GET /api/messages/:chatId`; publish `chat.read` throttled (~3s)
- `listChats`: batch unread counts (один SQL GROUP BY), индекс `chats(last_message_at DESC)`
- Rate limit на `POST /send` (Redis при `REDIS_URL`)

**Не входит:** threaded conversations (ветки как продукт), групповые чаты как продукт (поле `isGroup` зарезервировано).

**Ответы:** `Message.replyToId` → в `MessageData.replyTo` (preview исходного); `POST /send` принимает optional `replyToId` в том же чате.

## Стек

Express 5, Prisma 7, PostgreSQL, Zod, amqplib, JWT (user-context + service token), AWS S3 SDK (MinIO).

## Модели

- `Chat` — чат
- `ChatParticipant` — участник + `lastReadAt`
- `Message` — текст (может быть пустым при наличии вложений); `editedAt`, `forwardedFromId`, `replyToId`
- `MessageAttachment` — файл/фото: `kind` (`image`|`file`), `url`, `objectKey`, `mimeType`, `sizeBytes`

## API (через KrakenD `/api/messages`)

| Метод | Путь | Ответ |
|-------|------|--------|
| GET | `/chats` | `{ message, data, pagination }` |
| POST | `/chats` | flat `ChatData` |
| DELETE | `/chats/:chatId` | `{ message, status }` |
| GET | `/chats/:chatId/upload-url` | presigned PUT (`uploadUrl`, `publicUrl`, `key`) |
| GET | `/chats/:chatId/attachments` | `{ message, data, pagination }` (`kind=image\|file`) |
| GET | `/:chatId` | `{ message, data, pagination }` + mark read; `MessageData.attachments` |
| POST | `/send` | flat `MessageData` (`content` и/или `attachments[]`, optional `replyToId`) |
| POST | `/forward` | `{ message, data: MessageData[] }` — копии в целевые чаты |
| PATCH | `/:messageId` | flat `MessageData` — edit текста и/или вложений (`content`, `removeAttachmentIds`, `attachments`) |
| DELETE | `/:messageId` | `{ message, status, id, chatId }` — hard delete своего |
| DELETE | `/bulk` | `{ message, status, deletedIds }` — bulk delete своих |
| GET | `/health` | health + DB |

### Лимиты вложений

- До 5 файлов на сообщение
- До 20 MB на файл
- Ключи S3: `messages/{chatId}/{uuid}-{fileName}`

## Связи

| Компонент | Роль |
|-----------|------|
| KrakenD | JWT gateway |
| auth-service | service client `message-service` |
| user-service | авторы |
| MinIO | object storage |
| RabbitMQ `message.events` | realtime |
| notifications-service | emit `message:new`, `message:updated`, `message:deleted`, `chat:created`, `chat:deleted` |

## Порт

- `3004` / `SERVICE_NAME=social-message-service`
