FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/api/prisma apps/api/prisma
RUN npm ci
COPY . .
RUN npm run db:generate -w @sfs/api && npm run build
ENV NODE_ENV=production
RUN mkdir -p /app/.local-storage && chown node:node /app/.local-storage
USER node
