# ===========================================================================
# STAGE 1: Builder — Ubuntu 22.04 for full glibc + C++ toolchain
# ===========================================================================
FROM ubuntu:22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

# Install Node.js 20 LTS + C++ build toolchain in one layer
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates gnupg \
    build-essential python3 cmake \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── 1. Build shared package FIRST (server imports compiled shared at build time) ──
COPY shared/package.json  ./shared/
COPY shared/tsconfig.json ./shared/
COPY shared/src           ./shared/src
RUN npm install --prefix shared && npm run build --prefix shared

# ── 2. Server dependencies (snake-arena-shared resolves via file:../shared) ─
COPY server/package.json server/package-lock.json* ./server/
RUN npm install --prefix server

# ── 3. Client dependencies ────────────────────────────────────────────────────
COPY client/package.json client/package-lock.json* ./client/
RUN npm ci --prefix client

# ── 4. Copy all source ───────────────────────────────────────────────────────
COPY server ./server
COPY client ./client

# ── 5. Build C++ N-API native addon ─────────────────────────────────────────
WORKDIR /app/server
RUN npm run build:addon
WORKDIR /app

# ── 6. Compile TypeScript server ────────────────────────────────────────────
# shared/dist/*.d.ts must exist for TypeScript paths resolution to work
RUN npm run build:ts --prefix server

# ── 7. Build Vite frontend ───────────────────────────────────────────────────
RUN npm run build --prefix client

# ===========================================================================
# STAGE 2: Runner — Slim production image
# ===========================================================================
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Runtime C++ standard library (required by the native .node addon)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libstdc++6 libgcc-s1 \
    && rm -rf /var/lib/apt/lists/*

# ── Copy shared dist so npm install can resolve file:../shared ───────────────
# npm install with "snake-arena-shared": "file:../shared" needs ../shared to exist
COPY shared/package.json ./shared/
COPY --from=builder /app/shared/dist ./shared/dist

# ── Install server production-only deps ──────────────────────────────────────
COPY server/package.json server/package-lock.json* ./server/
RUN npm install --prefix server --omit=dev

# ── Copy compiled server output ───────────────────────────────────────────────
COPY --from=builder /app/server/dist ./server/dist

# ── Copy compiled C++ native addon ───────────────────────────────────────────
COPY --from=builder /app/server/build ./server/build

# ── Copy compiled frontend (served statically by Express) ────────────────────
COPY --from=builder /app/client/dist ./client/dist

# Non-root user for security
RUN groupadd -r snake && useradd -r -g snake snake \
    && mkdir -p /app/logs && chown -R snake:snake /app
USER snake

# Health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

EXPOSE 3000

CMD ["node", "server/dist/server.js"]
