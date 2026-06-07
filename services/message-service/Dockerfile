FROM node:20-alpine

ARG SERVICE_PORT=3001
ENV PORT=${SERVICE_PORT}

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma/ ./prisma/
COPY prisma.config.ts ./prisma.config.ts
RUN npx prisma generate

COPY . .
RUN npm run build

EXPOSE ${SERVICE_PORT}

CMD ["npm", "run", "start"]