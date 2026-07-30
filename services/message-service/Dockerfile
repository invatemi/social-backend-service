FROM node:20-alpine

ARG SERVICE_PORT=3004
ENV PORT=${SERVICE_PORT}

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma/ ./prisma/
COPY prisma.config.ts ./prisma.config.ts
RUN npx prisma generate

COPY . .
RUN npm run build \
  && mkdir -p dist/src \
  && cp -r src/generated dist/src/generated

EXPOSE ${SERVICE_PORT}

CMD ["npm", "run", "start"]