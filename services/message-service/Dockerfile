FROM node:22-alpine

ARG SERVICE_PORT=3004
ENV PORT=${SERVICE_PORT}

WORKDIR /app

COPY shared/security /shared/security
COPY scripts/copy-shared-security.cjs /scripts/copy-shared-security.cjs
COPY shared/security ./shared/security
COPY services/message-service/package*.json ./
RUN npm config set fetch-retries 5 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000
RUN npm ci

COPY services/message-service/prisma/ ./prisma/
COPY services/message-service/prisma.config.ts ./prisma.config.ts
RUN npx prisma generate

COPY services/message-service/ .
RUN npm run build \
  && mkdir -p dist/src \
  && cp -r src/generated dist/src/generated

EXPOSE ${SERVICE_PORT}

CMD ["npm", "run", "start"]
