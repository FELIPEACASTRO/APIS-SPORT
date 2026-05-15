# Dockerfile — APIS // SPORT (production)
# Multi-stage build + non-root user + minimal final image.
# syntax=docker/dockerfile:1.7

# ── Stage 1: deps ───────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ── Stage 2: test (sanity gate) ─────────────────────────────────────────────
FROM node:22-alpine AS test
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm test && npm run qa && npm run qa:100x

# ── Stage 3: runtime ────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    LOG_FORMAT=json \
    LOG_LEVEL=info

# Non-root
RUN addgroup -g 10001 -S app && adduser -u 10001 -S -G app app

WORKDIR /app
COPY --from=deps --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app package.json package-lock.json ./
COPY --chown=app:app server.js ./server.js
COPY --chown=app:app src ./src
COPY --chown=app:app public ./public
COPY --chown=app:app data ./data
COPY --chown=app:app scripts ./scripts

USER app
EXPOSE 3000

# Healthcheck simples — usa o probe /api/live
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Sinaliza com SIGTERM (default do K8s) — server.js trata graceful shutdown
STOPSIGNAL SIGTERM

CMD ["node", "server.js"]
