# message-service — Overview

## Назначение

`message-service` — **заготовка сервиса сообщений**. Текущая реализация минимальна и не соответствует полному архитектурному шаблону остальных сервисов.

## Текущее состояние

- Express + `pg` Pool (без Prisma в runtime, хотя зависимости Prisma присутствуют)
- `GET /health` — упрощённый (без проверки БД в ответе)
- `GET /api/users` — тестовый запрос `SELECT * FROM users`
- Нет `middleware/`, `routes/`, `consumers/`, graceful shutdown

## Зона ответственности (целевая)

В полной архитектуре социальной сети этот сервис предназначен для **личных сообщений / чатов**. Пока не реализован домен messaging.

## Зависимости

| Тип | Компонент |
|-----|-----------|
| БД | PostgreSQL `msg_db` |

## Связи

- Включён в `docker-compose` и health dependency KrakenD
- Интеграция с frontend message module — в разработке

## Порт

- По умолчанию: `3004`
- `SERVICE_NAME=social-message-service`

## Рекомендация

При развитии сервиса привести к шаблону `post-service` / `user-service`: Prisma, krakend-auth, error-handler, lifecycle, event bus при необходимости.
