## 🏗️ Архитектура

- 5 микросервисов на Node.js + TypeScript + Express
- Изолированные PostgreSQL базы данных
- API Gateway на KrakenD с маршрутизацией и валидацией
- Оркестрация через Docker Compose
- Health checks, environment-based конфигурация
- Git monorepo с правильным .gitignore

## 🚀 Запуск

```bash
docker compose up -d --build
curl http://localhost:8080/api/auth/health