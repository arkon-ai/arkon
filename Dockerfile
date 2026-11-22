# ── Stage 1: Dependencies ────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN --mount=type=secret,id=arkon_npm_token,env=ARKON_NPM_TOKEN npm ci --omit=dev

# ── Stage 2: Build ──────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN --mount=type=secret,id=arkon_npm_token,env=ARKON_NPM_TOKEN npm ci

COPY src/ src/
COPY public/ public/
COPY migrations/ migrations/
COPY scripts/ scripts/
COPY next.config.ts tsconfig.json postcss.config.mjs eslint.config.mjs vitest.config.ts ./

# Next.js standalone build
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Migration runner: compiled here by the locked typescript, so the runtime stage needs no tsx
RUN node_modules/.bin/tsc --module commonjs --target es2022 --moduleResolution node --esModuleInterop --skipLibCheck --types node --outDir scripts scripts/migrate.ts

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
RUN addgroup --system --gid 1001 arkon && adduser --system --uid 1001 arkon

# Copy standalone build output
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Copy migrations and runner for entrypoint
COPY migrations/ migrations/
COPY --from=build /app/scripts/migrate.js scripts/migrate.js
COPY package.json ./

# pg (database wait + migration runner) and web-push (VAPID notifications) come from the
# deps stage's locked production install: zero registry install in the runtime stage
COPY --from=deps /app/node_modules ./node_modules

# Copy entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

RUN chown -R arkon:arkon /app
USER arkon

EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]
