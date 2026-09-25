# Image for the MINSA server deployment: the bot with message reactivity only
# (DATABASE_ENABLED=false, see README). Run exactly ONE container: conversation
# state lives in the process's memory in that mode.
#
# Node 22: the version the CI runs (.github/workflows/ci.yml). package.json has
# no engines field and there is no .nvmrc, so CI is the only pin.

# ---- deps: install exactly what package-lock.json says ----------------------
FROM node:22-alpine AS deps
# libc6-compat for native modules built against glibc; openssl for Prisma's engine.
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json ./
# postinstall runs `prisma generate`, which needs the schema (never a database).
COPY prisma ./prisma
RUN npm ci

# ---- build: a standalone Next.js server, without touching a database ----------
FROM node:22-alpine AS build
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT_STANDALONE=true \
    DATABASE_ENABLED=false
RUN npm run build:no-db

# ---- runtime: only the traced server, static assets and public files ---------
FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_ENABLED=false

# The official node image already ships the unprivileged `node` user.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Writable only for LOG_TO_FILE=true (daily NDJSON folders under ./logs).
RUN mkdir -p /app/logs && chown node:node /app/logs

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
