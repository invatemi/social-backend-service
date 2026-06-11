#!/usr/bin/env sh
# Копирует все .env.example → .env (если .env ещё не существует).
# Запуск:  sh scripts/setup-env.sh

set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

copy_if_missing() {
  example="$1"
  target="$2"

  if [ ! -f "$example" ]; then
    echo "Пропущено: $example не найден"
    return
  fi

  if [ -f "$target" ]; then
    echo "Пропущено: $target уже существует"
    return
  fi

  cp "$example" "$target"
  echo "Создан: $target"
}

copy_if_missing "$ROOT/.env.example" "$ROOT/.env"
copy_if_missing "$ROOT/services/auth-service/.env.example" "$ROOT/services/auth-service/.env"
copy_if_missing "$ROOT/services/user-service/.env.example" "$ROOT/services/user-service/.env"
copy_if_missing "$ROOT/services/post-service/.env.example" "$ROOT/services/post-service/.env"
copy_if_missing "$ROOT/services/message-service/.env.example" "$ROOT/services/message-service/.env"
copy_if_missing "$ROOT/services/notifications-service/.env.example" "$ROOT/services/notifications-service/.env"

echo ""
echo "Готово. Отредактируйте .env файлы и замените все replace-with-* значения на свои секреты."
