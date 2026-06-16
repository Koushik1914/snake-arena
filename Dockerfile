# ===========================================================================
# STAGE 1: Builder — Ubuntu 22.04 for full glibc C++ toolchain
# ===========================================================================
FROM ubuntu:22.04 AS builder

# Prevent interactive prompts during apt installs
ENV DEBIAN_FRONTEND=noninteractive

# Install Node.js 20 LTS + C++ build toolchain
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates gnupg \
    build-essential python3 cmake \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Install root workspace deps ──────────────────────────────────────────────
COPY package.json package-lock.json* ./
RUN npm install

# ── Install server deps (includes node-addon-api for N-API) ─────────────────
COPY server/package.json server/package-lock.json* ./server/
RUN npm install --prefix server

# ── Install client deps (PixiJS, msgpack, vite, etc.) ───────────────────────
COPY client/package.json client/package-lock.json* ./client/
RUN npm install --prefix client

# ── Copy source files ────────────────────────────────────────────────────────
COPY shared  ./shared
COPY server  ./server
COPY client  ./client

# ── Compile C++ N-API addon (with O2 optimization) ───────────────────────────
RUN npm run build --prefix server

# ── Bundle frontend assets ───────────────────────────────────────────────────
RUN npm run build --prefix client

# ===========================================================================
# STAGE 2: Runner — Slim production image
# ===========================================================================
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy only production server dependencies
COPY server/package.json ./server/
RUN npm install --prefix server --only=production

# Copy compiled artifacts from builder
COPY --from=builder /app/server/dist   ./server/dist
COPY --from=builder /app/server/build  ./server/build
COPY --from=builder /app/client/dist   ./client/dist

# Health check for Docker orchestrators / load balancers
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

EXPOSE 3000

CMD ["node", "server/dist/server.js"]
