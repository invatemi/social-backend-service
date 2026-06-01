FROM node:20-alpine

ARG SERVICE_PORT=3001
ENV PORT=${SERVICE_PORT}

WORKDIR /app

COPY package*.json ./
RUN npm ci || npm install

COPY . .

# Сборка TS
RUN npm run build || true

EXPOSE ${SERVICE_PORT}

CMD ["npm", "run", "start"]