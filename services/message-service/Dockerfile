FROM node:18-alpine

ARG SERVICE_PORT=3001
ENV PORT=${SERVICE_PORT}

WORKDIR /app

COPY package*.json ./
# npm ci требует package-lock.json; если его нет — используйте npm install
RUN npm ci || npm install

COPY . .

# Сборка TS
RUN npm run build || true

EXPOSE ${SERVICE_PORT}

CMD ["npm", "run", "start"]