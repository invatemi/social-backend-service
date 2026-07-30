FROM node:22-alpine

ARG SERVICE_PORT=3003
ENV PORT=${SERVICE_PORT}

WORKDIR /app

# prebuild (package.json) resolves ../../scripts and ../shared from repo root layout
COPY shared/security /shared/security
COPY scripts/copy-shared-security.cjs /scripts/copy-shared-security.cjs
COPY shared/security ./shared/security
COPY services/post-service/package*.json ./
RUN npm config set fetch-retries 5 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000
RUN npm ci

COPY services/post-service/prisma/ ./prisma/
COPY services/post-service/prisma.config.ts ./prisma.config.ts
RUN npx prisma generate

COPY services/post-service/ .
RUN npm run build \
  && mkdir -p dist/src \
  && cp -r src/generated dist/src/generated

EXPOSE ${SERVICE_PORT}

CMD ["npm", "run", "start"]
