# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

ARG APP_NAME=insider-scanner

WORKDIR /usr/src/app

COPY package*.json nest-cli.json tsconfig*.json ./
RUN npm ci --legacy-peer-deps

COPY apps/ ./apps/
RUN npx nest build ${APP_NAME}

# ─── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production

ARG APP_NAME=insider-scanner

WORKDIR /usr/src/app

# Install prod deps only (NestJS modules not bundled by webpack)
COPY package*.json ./
RUN npm ci --legacy-peer-deps --omit=dev

# Copy webpack bundle from builder
COPY --from=builder /usr/src/app/dist/apps/${APP_NAME}/main.js ./dist/apps/${APP_NAME}/main.js

ENV NODE_ENV=production
EXPOSE 3235

CMD node dist/apps/${APP_NAME}/main