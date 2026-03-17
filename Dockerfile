# ── Stage 1: Dependencies ────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 2: Build ──────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY src/ src/
COPY public/ public/
COPY migrations/ migrations/
COPY scripts/ scripts/
COPY next.config.ts tsconfig.json postcss.config.mjs eslint.config.mjs ./

# Next.js standalone build
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Stage 3: Runtime ────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Install wget for health checks
RUN apk add --no-cache wget

# Create non-root user
RUN addgroup --system --gid 1001 arkon && \
    adduser --system --uid 1001 arkon

# Copy standalone build output
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Copy migrations and runner for entrypoint
COPY migrations/ migrations/
COPY scripts/migrate.ts scripts/migrate.ts
COPY package.json ./

# Install tsx for migration runner + web-push for VAPID notifications
RUN npm install --no-save tsx pg web-push

# Copy entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

RUN chown -R arkon:arkon /app
USER arkon

EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]
