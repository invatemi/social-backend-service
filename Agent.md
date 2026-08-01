# Agent.md — Навигация по документации social-backend-service

Корневой индекс для AI-агентов и разработчиков. Описывает архитектуру микросервисной платформы социальной сети.

## Как пользоваться документацией

1. Начните с [architecture-guidelines.md](docs/rules/architecture-guidelines.md) — общая картина и границы сервисов.
2. Прочитайте [api-conventions.md](docs/rules/api-conventions.md) и [coding-standards.md](docs/rules/coding-standards.md) перед изменением кода.
3. Перейдите к `overview.md` нужного сервиса, затем к `instructions.md` для запуска и endpoint'ов.

## Дерево `/docs`

```
docs/
├── rules/
│   ├── architecture-guidelines.md
│   ├── coding-standards.md
│   └── api-conventions.md
├── auth-service/
│   ├── overview.md
│   └── instructions.md
├── user-service/
│   ├── overview.md
│   └── instructions.md
├── post-service/
│   ├── overview.md
│   └── instructions.md
├── notifications-service/
│   ├── overview.md
│   └── instructions.md
└── message-service/
    ├── overview.md
    └── instructions.md
```

## Глобальные правила

| Файл | Описание |
|------|----------|
| [docs/rules/architecture-guidelines.md](docs/rules/architecture-guidelines.md) | Архитектурные принципы, границы микросервисов, KrakenD, RabbitMQ, Redis, схемы взаимодействия. |
| [docs/rules/coding-standards.md](docs/rules/coding-standards.md) | Стандарты TypeScript/Express, нейминг, ошибки, Prisma, event bus, тестирование. |
| [docs/rules/api-conventions.md](docs/rules/api-conventions.md) | Форматы HTTP-ответов, статус-коды, auth через gateway, пагинация, internal API. |

## Микросервисы

### auth-service

| Файл | Описание |
|------|----------|
| [docs/auth-service/overview.md](docs/auth-service/overview.md) | Назначение auth-service: JWT, регистрация, связь с user-service через `user.registered`. |
| [docs/auth-service/instructions.md](docs/auth-service/instructions.md) | Запуск, env, endpoint'ы register/login/refresh и troubleshooting. |

### user-service

| Файл | Описание |
|------|----------|
| [docs/user-service/overview.md](docs/user-service/overview.md) | Профили, друзья, подписки, password flow, S3, internal API для post-service. |
| [docs/user-service/instructions.md](docs/user-service/instructions.md) | Запуск, ключевые маршруты, бизнес-правила friend/follow и consumer provisioning. |

### post-service

| Файл | Описание |
|------|----------|
| [docs/post-service/overview.md](docs/post-service/overview.md) | Посты, комментарии, лайки, ленты, кэш Redis и события post.events. |
| [docs/post-service/instructions.md](docs/post-service/instructions.md) | Запуск, env, полный список endpoint'ов и правила валидации контента. |

### notifications-service

| Файл | Описание |
|------|----------|
| [docs/notifications-service/overview.md](docs/notifications-service/overview.md) | In-app уведомления, Socket.IO, consumers user/post событий. |
| [docs/notifications-service/instructions.md](docs/notifications-service/instructions.md) | REST API уведомлений, consumers, realtime и диагностика. |

### message-service

| Файл | Описание |
|------|----------|
| [docs/message-service/overview.md](docs/message-service/overview.md) | Чаты, сообщения, `message.events`, контракт фронта. |
| [docs/message-service/instructions.md](docs/message-service/instructions.md) | Запуск, env, REST endpoint'ы, realtime troubleshooting. |

## Инфраструктура (вне `/docs`)

| Компонент | Путь в репозитории |
|-----------|-------------------|
| Docker Compose | `docker-compose.yml` |
| KrakenD | `krakend/krakend.tmpl` |
| RabbitMQ config | `rabbitmq/` |
| Env template | `.env.example` |

## Стек (кратко)

Node.js 18+ · TypeScript · Express 5 · Prisma · PostgreSQL · RabbitMQ · Redis · KrakenD · MinIO · Socket.IO

## Порты по умолчанию

| Сервис | Порт |
|--------|------|
| KrakenD | 8080 |
| auth-service | 3001 |
| user-service | 3002 |
| post-service | 3003 |
| message-service | 3004 |
| notifications-service | 3005 |
