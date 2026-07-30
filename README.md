# Social Backend Service

Микросервисный backend социальной платформы: аутентификация, профили пользователей, публикации, сообщения и уведомления в реальном времени. Сервисы изолированы по доменам, взаимодействуют через API Gateway и асинхронные события RabbitMQ.

## Технологический стек

| Категория | Технологии |
|-----------|------------|
| Язык / runtime | Node.js 18+, TypeScript |
| HTTP | Express 5 |
| API Gateway | [KrakenD](https://www.krakend.io/) 2.7 (JWT, CORS, маршрутизация) |
| Базы данных | PostgreSQL 16 (отдельная БД на сервис), Prisma ORM |
| Кэш | Redis 7 |
| Очереди | RabbitMQ 3.12 (domain events) |
| Файловое хранилище | MinIO (S3-совместимое API) |
| Аутентификация | JWT (HS256), refresh tokens |
| Real-time | Socket.IO (notifications-service) |
| Логирование | Pino, Elastic Stack (опционально) |
| Контейнеризация | Docker, Docker Compose |

## Архитектура

```
                    ┌─────────────────┐
                    │   Frontend      │
                    │  (React/Vite)   │
                    └────────┬────────┘
                             │ HTTP :8088 (host) → :8080 (container)
                    ┌────────▼────────┐
                    │    KrakenD      │  JWT validation, CORS, routing
                    │  API Gateway    │
                    └────────┬────────┘
         ┌───────────────────┼───────────────────┐
         │                   │                   │
  ┌──────▼──────┐    ┌───────▼──────┐    ┌───────▼──────┐
  │ auth-service│    │ user-service │    │ post-service │
  │   :3001     │    │    :3002     │    │    :3003     │
  └──────┬──────┘    └───────┬──────┘    └───────┬──────┘
         │                   │                   │
  ┌──────▼──────┐    ┌───────▼──────┐    ┌───────▼──────┐
  │   auth-db   │    │   user-db    │    │   post-db    │
  └─────────────┘    └──────────────┘    └──────────────┘

  ┌─────────────┐    ┌──────────────┐         RabbitMQ
  │msg-service  │    │ notifications│◄──────── events ────►
  │   :3004     │    │   :3005      │
  └──────┬──────┘    └───────┬──────┘
         │                   │
  ┌──────▼──────┐    ┌───────▼──────┐
  │   msg-db    │    │  notif-db    │
  └─────────────┘    └──────────────┘

  Инфраструктура: Redis, MinIO, RabbitMQ (internal network)
```

**Принципы:**
- Database-per-service — каждый микросервис владеет своей схемой PostgreSQL
- JWT проверяется на уровне KrakenD; claims (`userId`, `role`) проксируются в заголовках `x-user-id`, `x-user-role`
- Межсервисная коммуникация: синхронная (HTTP) и асинхронная (RabbitMQ exchanges)

## Структура репозитория

```
social-backend-service/
├── .env.example                 # Корневой конфиг для Docker Compose
├── docker-compose.yml           # Оркестрация всех сервисов
├── scripts/
│   ├── setup-env.ps1            # Инициализация .env (Windows)
│   ├── setup-env.sh             # Инициализация .env (Linux/macOS)
│   ├── bootstrap-db.ps1         # migrate + seed roles после compose up
│   └── bootstrap-db.sh
│
├── krakend/                     # API Gateway
│   ├── krakend.json             # Маршруты (исходник)
│   ├── krakend.tmpl             # Шаблон с JWT validator и CORS из env
│   └── generate-tmpl.js         # Генератор tmpl из json
│
├── openapi/
│   └── social-backend.openapi.yaml
│
├── rabbitmq/                    # Конфигурация брокера
├── minio/                       # Init-скрипт S3-бакета
├── elastic/                     # Elastic Stack (профиль observability)
│
└── services/
    ├── auth-service/            # Регистрация, login, JWT, refresh tokens
    ├── user-service/            # Профили, друзья, подписчики, аватары, SMTP
    ├── post-service/            # Посты, комментарии, лайки, лента
    ├── message-service/         # Сообщения (в разработке)
    └── notifications-service/   # REST + WebSocket уведомления
```

Каждый сервис содержит:
- `src/config/env.ts` — типизированная конфигурация из переменных окружения
- `src/middleware/` — логирование, обработка ошибок, event-bus
- `prisma/` — схема и миграции БД
- `.env.example` — шаблон для локальной разработки
- `Dockerfile`

## Быстрый старт

### Требования

- Docker Desktop 4.x+ и Docker Compose v2
- Node.js 18+ (для локальной разработки отдельных сервисов)

### Совместимость с frontend

Локальный стек рассчитан на [social-network-frontend-react](https://github.com/invatemi/social-network-frontend-react):

| Компонент | URL |
|-----------|-----|
| Frontend (Vite) | `http://localhost:5173` → `CORS_ORIGINS` |
| HTTP API (KrakenD host) | `http://localhost:8088` → `VITE_API_URL` |
| WebSocket | `http://localhost:3005` → `VITE_WS_URL` |
| MinIO avatars | `http://localhost:9000` |

`KRAKEND_EXTERNAL_PORT=8088` по умолчанию (host `8080` часто занят Apache/`httpd`). Внутри Docker gateway слушает `8080`.

### 1. Настройка переменных окружения

```powershell
# Windows
.\scripts\setup-env.ps1
```

```bash
# Linux / macOS
sh scripts/setup-env.sh
```

`.env.example` содержит готовые **local-dev** секреты (достаточно для `docker compose up`). Для prod замените пароли/JWT/S3. `SMTP_*` нужны только для сброса пароля по почте.

| Переменная | Описание |
|------------|----------|
| `DB_PASSWORD` | Пароль PostgreSQL (общий для всех БД в dev) |
| `JWT_SECRET` | Секрет JWT, минимум 32 символа |
| `RABBITMQ_DEFAULT_USER` / `PASS` | Должны совпадать с user в `rabbitmq/definitions.json` |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Ключи MinIO |
| `SMTP_*` | Настройки почты (смена пароля) |
| `CORS_ORIGINS` | URL фронтенда через запятую (`http://localhost:5173`) |

### 2. Запуск через Docker Compose

```bash
docker compose up --build -d
```

С observability-стеком (Elasticsearch + Kibana + Filebeat):

```bash
docker compose --profile observability up --build -d
```

### 3. Миграции и seed ролей

Контейнеры **не** применяют Prisma migrate при старте. После первого `up`:

```powershell
.\scripts\bootstrap-db.ps1
```

```bash
sh scripts/bootstrap-db.sh
```

Скрипт: `prisma migrate deploy` во всех сервисах + seed таблицы `roles` в `auth_db` и `users_db` (без ролей регистрация/`user.registered` падают по FK).

### 4. Проверка

| Сервис | URL |
|--------|-----|
| API Gateway | http://127.0.0.1:8088 |
| Auth health | http://127.0.0.1:8088/api/auth/health |
| MinIO Console | http://127.0.0.1:9001 |
| Notifications WebSocket | http://127.0.0.1:3005 |
| Kibana (с профилем) | http://127.0.0.1:5601 |

Краткий smoke: health всех `/api/*/health` → `POST /api/auth/register` → `GET /api/users/me` с Bearer token → `POST /api/posts`.

## Конфигурация

### Уровни конфигурации

1. **Корневой `.env`** — инфраструктура и Docker Compose (БД, RabbitMQ, Redis, MinIO, JWT, CORS)
2. **`services/*/.env`** — локальная разработка отдельного сервиса вне Docker

В production переменные передаются через `environment` в `docker-compose.yml` или оркестратор (Kubernetes secrets, Docker secrets).

### Ключевые переменные

```env
# Безопасность: по умолчанию порты доступны только с localhost
BIND_ADDRESS=127.0.0.1

# CORS для gateway и WebSocket (через запятую)
CORS_ORIGINS=http://localhost:5173,https://myapp.example.com

# Для production за reverse-proxy
BIND_ADDRESS=0.0.0.0
```

### Локальная разработка сервиса

```bash
cd services/auth-service
cp .env.example .env   # если ещё не создан setup-скриптом
npm install
npx prisma migrate dev
npm run dev
```

## API

Публичный контракт описан в `openapi/social-backend.openapi.yaml`. Все клиентские запросы идут через KrakenD (host-порт `KRAKEND_EXTERNAL_PORT`, по умолчанию `8088`).

Основные группы эндпоинтов:
- `/api/auth/*` — регистрация, login, refresh, logout
- `/api/users/*` — профили, поиск, друзья, подписчики, аватары
- `/api/posts/*` — CRUD постов, лайки, лента
- `/api/comments/*` — комментарии
- `/api/notifications/*` — уведомления

## Лицензия

Проект распространяется под лицензией [Apache License 2.0](LICENSE).

Copyright © 2026 [invatemi](https://github.com/invatemi)
