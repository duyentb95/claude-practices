# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

ARG APP_NAME=insider-scanner

WORKDIR /usr/src/app

# Copy dependency manifests first (layer cache)
COPY package*.json nest-cli.json tsconfig*.json ./

# Install ALL deps (including devDeps needed for nest build / tsc / webpack)
RUN npm ci --legacy-peer-deps

# Copy source
COPY apps/ ./apps/

# Build the target app (webpack bundles into a single main.js)
RUN npx nest build ${APP_NAME}

# ─── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production

ARG APP_NAME=insider-scanner

WORKDIR /usr/src/app

# webpack output is self-contained — no node_modules needed at runtime
COPY --from=builder /usr/src/app/dist/apps/${APP_NAME}/main.js ./dist/apps/${APP_NAME}/main.js

ENV APP_NAME=${APP_NAME}
ENV NODE_ENV=production

EXPOSE 3235

CMD node dist/apps/${APP_NAME}/main