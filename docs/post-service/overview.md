# post-service — Overview

## Назначение

`post-service` управляет **контентом социальной сети**: посты, комментарии, лайки, персональная и публичная ленты.

## Зона ответственности

- CRUD постов (включая draft/publish)
- Комментарии к постам
- Toggle лайков
- Публичная лента, лента друзей/подписчиков, посты пользователя
- Обогащение постов данными авторов (через user-service)
- Публикация событий `post.*`, `comment.*`, `post.liked`
- Кэширование списков и отдельных постов (Redis)

## Зависимости

| Тип | Компонент |
|-----|-----------|
| БД | PostgreSQL `post_db` (Prisma) |
| Cache | Redis |
| Broker | RabbitMQ `post.events` |
| HTTP | user-service (`USER_SERVICE_URL`) |

## Связи

- **Consumers:** notifications-service (post/comment events)
- **Sync:** `fetchAuthorsByIds`, `fetchFeedSourceUserIds` → user-service internal API

## API-группы

| Префикс | Содержание |
|---------|------------|
| `/api/posts` | посты, feed, like, publish |
| `/api/comments` | комментарии |

## Порт

- По умолчанию: `3003`
- `SERVICE_NAME=social-post-service`
