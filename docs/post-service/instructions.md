# post-service — Instructions

## Локальный запуск

```bash
docker compose up -d social-post-service post-db redis rabbitmq social-user-service
```

Standalone:

```bash
cd services/post-service
cp .env.example .env
npm install
npx prisma migrate deploy
npm run dev
```

## Критичные env

| Переменная | Назначение |
|------------|------------|
| `DATABASE_URL` | post_db |
| `REDIS_URL` | Кэш постов |
| `RABBITMQ_URL` | post.events |
| `POST_EVENTS_EXCHANGE` | Имя exchange |
| `USER_SERVICE_URL` | Base URL user-service |
| `USER_SERVICE_TIMEOUT_MS` | Таймаут S2S |
| `POST_CACHE_TTL_SECONDS` | TTL одного поста |
| `POST_LIST_CACHE_TTL_SECONDS` | TTL списков |

## Ключевые endpoint'ы

### Посты (защищённые — нужен `x-user-id` через gateway)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/posts` | Создать пост |
| GET | `/api/posts/me` | Свои посты (включая черновики) |
| PUT | `/api/posts/:id` | Обновить |
| DELETE | `/api/posts/:id` | Удалить |
| POST | `/api/posts/:id/publish` | Опубликовать |
| POST | `/api/posts/:id/unpublish` | В черновик |
| POST | `/api/posts/:id/like` | Toggle лайк |
| GET | `/api/posts/feed` | Персональная лента |

### Публичные

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/posts` | Все опубликованные |
| GET | `/api/posts/:id` | Один пост |
| GET | `/api/posts/user/:userId` | Посты пользователя |

### Комментарии

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/comments` | Создать (auth) |
| PUT/DELETE | `/api/comments/:id` | Изменить/удалить (auth) |
| GET | `/api/comments/post/:postId` | Список |
| GET | `/api/comments/post/:postId/count` | Счётчик |

## Бизнес-правила

- Редактировать/удалять пост может только владелец (`id_user`).
- Контент: до 10000 символов; title до 150; imageUrl — валидный URL.
- Пост можно создать с пустым content, если есть `imageUrl`.
- `toggleLike` — транзакция like + increment/decrement `likes_count`.
- При мутациях — инвалидация Redis (`posts:feed:*`, `posts:user:*`).
- Feed: источники из user-service (друзья + подписчики).

## События RabbitMQ

`post.created`, `post.updated`, `post.deleted`, `post.liked`, `comment.created`, `comment.updated`, `comment.deleted`.

## Тесты

```bash
cd services/post-service
npm test
```
