FROM node:22-alpine

ARG SERVICE_PORT=3001
ENV PORT=${SERVICE_PORT}

WORKDIR /app

COPY shared/security ./shared/security
COPY services/auth-service/package*.json ./
RUN npm config set fetch-retries 5 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000
RUN npm ci

COPY services/auth-service/prisma/ ./prisma/
COPY services/auth-service/prisma.config.ts ./prisma.config.ts
RUN npx prisma generate

COPY services/auth-service/ .
RUN npm run build

EXPOSE ${SERVICE_PORT}

CMD ["npm", "run", "start"]
