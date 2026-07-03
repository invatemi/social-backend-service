# user-service — Overview

## Назначение

`user-service` — **социальный граф и профили**: пользователи, подписки, друзья, поиск, аватары (S3), смена пароля.

## Зона ответственности

- CRUD профиля (`users`)
- Followers / following
- Friend requests, friendships, relation status
- Поиск пользователей
- Presigned URL для загрузки аватаров (MinIO/S3)
- Смена пароля (код на email → update в `auth_db`)
- Provisioning профиля из события `user.registered`
- Internal API для `post-service` и `notifications-service`

## Зависимости

| Тип | Компонент |
|-----|-----------|
| БД | PostgreSQL `user_db` (Prisma) |
| Auth БД | PostgreSQL `auth_db` (pg Pool — password flow) |
| Cache | Redis |
| Broker | RabbitMQ `user.events` (publish + subscribe) |
| Storage | MinIO / S3 |
| Email | SMTP (nodemailer) |

## Связи

- **Входящие:** KrakenD (клиент), RabbitMQ (`user.registered` от auth)
- **Исходящие:** события `user.updated`, `follow.*`, `friend.*`; HTTP internal — вызывается из post-service

## API-группы

| Префикс | Модуль |
|---------|--------|
| `/api/users` | profile, password, search, internal |
| `/api/followers` | подписки |
| `/api/friends` | друзья и заявки |

## Порт

- По умолчанию: `3002`
- `SERVICE_NAME=social-user-service`
