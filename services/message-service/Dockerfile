FROM node:20-alpine

ARG SERVICE_PORT=3001
ENV PORT=${SERVICE_PORT}

WORKDIR /app

# 1. Копируем зависимости
COPY package*.json ./

# 2. Устанавливаем зависимости
RUN npm ci || npm install

# 3. Копируем Prisma-файлы ДО генерации клиента
COPY prisma/ ./prisma/
COPY prisma.config.ts ./prisma.config.ts

# 4. 🔑 Генерируем Prisma Client (теперь схема доступна)
RUN npx prisma generate

# 5. Копируем остальной исходный код
COPY . .

# 6. Собираем TypeScript
RUN npm run build || true

EXPOSE ${SERVICE_PORT}

CMD ["npm", "run", "start"]