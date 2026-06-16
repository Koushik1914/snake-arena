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

# ── 1. Shared package (source, no build step needed) ────────────────────────
COPY shared/package.json ./shared/
COPY shared/src          ./shared/src

# ── 2. Server dependencies (includes node-addon-api) ────────────────────────
COPY server/package.json server/package-lock.json* ./server/
RUN npm ci --prefix server

# ── 3. Client dependencies ────────────────────────────────────────────────────
COPY client/package.json client/package-lock.json* ./client/
RUN npm ci --prefix client

# ── 4. Copy all source ───────────────────────────────────────────────────────
COPY server ./server
COPY client ./client

# ── 5. Build C++ N-API native addon ─────────────────────────────────────────
# Runs node-gyp rebuild from within server/ where binding.gyp lives
WORKDIR /app/server
RUN npm run build:addon
WORKDIR /app

# ── 6. Compile TypeScript server ────────────────────────────────────────────
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

# Production-only server dependencies
COPY server/package.json server/package-lock.json* ./server/
RUN npm ci --prefix server --omit=dev

# Compiled server TypeScript → JS
COPY --from=builder /app/server/dist ./server/dist

# Compiled C++ native addon
COPY --from=builder /app/server/build ./server/build

# Compiled frontend (served statically by Express)
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
