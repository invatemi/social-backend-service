# message-service — Overview

## Назначение

`message-service` управляет **личными чатами и сообщениями**: inbox, создание 1–1 чата, история, отправка текста и вложений, realtime через RabbitMQ → notifications Socket.IO.

## Зона ответственности

- CRUD чатов и сообщений в `msg_db`
- Вложения (фото/файлы) через MinIO: presigned PUT → метаданные в `message_attachments`
- Обогащение участников/авторов через user-service (`/api/users/internal/authors`)
- События `message.created`, `chat.created`, `chat.deleted` в exchange `message.events`
- Read-state: обновление `lastReadAt` при `GET /api/messages/:chatId`

**Не входит:** forward/reply, групповые чаты (поле `isGroup` зарезервировано).

## Стек

Express 5, Prisma 7, PostgreSQL, Zod, amqplib, JWT (user-context + service token), AWS S3 SDK (MinIO).

## Модели

- `Chat` — чат
- `ChatParticipant` — участник + `lastReadAt`
- `Message` — текст (может быть пустым при наличии вложений)
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
| POST | `/send` | flat `MessageData` (`content` и/или `attachments[]`) |
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
| notifications-service | emit `message:new`, `chat:created`, `chat:deleted` |

## Порт

- `3004` / `SERVICE_NAME=social-message-service`
