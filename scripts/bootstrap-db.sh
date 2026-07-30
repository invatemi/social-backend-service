#!/bin/sh
# Applies Prisma migrations and seeds roles for local Docker Compose.
# Run after: docker compose up -d  (services healthy)
set -eu
cd "$(dirname "$0")/.."

for service in \
  social-auth-service \
  social-user-service \
  social-post-service \
  social-message-service \
  social-notifications-service
do
  echo "==== migrate $service ===="
  docker compose exec -T "$service" npx prisma migrate deploy
done

echo "==== seed roles (auth_db) ===="
docker compose exec -T auth-db psql -U postgres -d auth_db -c \
  "INSERT INTO roles (id, name) VALUES (1, 'admin'), (2, 'moderator'), (3, 'user'), (4, 'guest') ON CONFLICT (id) DO NOTHING;"

echo "==== seed roles (users_db) ===="
docker compose exec -T user-db psql -U postgres -d users_db -c \
  "INSERT INTO roles (id, name) VALUES (1, 'admin'), (2, 'moderator'), (3, 'user'), (4, 'guest') ON CONFLICT (id) DO NOTHING;"

echo ""
echo "Done. Smoke check: http://127.0.0.1:8088/api/auth/health"
