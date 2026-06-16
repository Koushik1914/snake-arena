#!/usr/bin/env bash
# ===========================================================================
# Snake Arena — One-Command VPS Deployment Script
# ===========================================================================
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# Requirements:
#   - Ubuntu 22.04 or later
#   - Run as a non-root user with sudo privileges
#   - Git repository already cloned
# ===========================================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log()  { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC}   $1"; }
fail() { echo -e "${RED}[error]${NC}  $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ─── 1. Install Node.js 20 LTS if missing ──────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node -e 'process.stdout.write(process.version.split(".")[0].slice(1))')" -lt 20 ]]; then
  log "Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  log "Node.js $(node --version) already installed."
fi

# ─── 2. Install C++ build tools ────────────────────────────────────────────
if ! command -v g++ &>/dev/null; then
  log "Installing build-essential and python3..."
  sudo apt-get update
  sudo apt-get install -y build-essential python3
else
  log "C++ toolchain already installed."
fi

# ─── 3. Install PM2 globally ───────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  log "Installing PM2..."
  sudo npm install -g pm2
else
  log "PM2 $(pm2 --version) already installed."
fi

# ─── 4. Install shared workspace ───────────────────────────────────────────
log "Installing shared dependencies..."
npm install --prefix shared

# ─── 5. Install & build server (C++ addon + TypeScript) ────────────────────
log "Installing server dependencies..."
npm ci --prefix server

log "Building server (TypeScript + C++ native addon)..."
npm run build --prefix server

# ─── 6. Install & build client (Vite) ──────────────────────────────────────
log "Installing client dependencies..."
npm ci --prefix client

log "Building client (Vite production bundle)..."
npm run build --prefix client

# ─── 7. Create logs directory ──────────────────────────────────────────────
mkdir -p logs

# ─── 8. Copy env if missing ────────────────────────────────────────────────
if [[ ! -f server/.env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example server/.env
    warn "Created server/.env from .env.example — review and adjust values!"
  fi
fi

# ─── 9. Start / reload with PM2 ────────────────────────────────────────────
if pm2 list | grep -q "neon-reptilia"; then
  log "Reloading existing PM2 process (zero-downtime)..."
  pm2 reload ecosystem.config.js --env production
else
  log "Starting new PM2 process..."
  pm2 start ecosystem.config.js --env production
fi

# ─── 10. Save PM2 process list & enable startup ────────────────────────────
pm2 save
pm2 startup | tail -n 1 | sudo bash || true

log ""
log "✅ Deployment complete!"
log "   Server is running on port 3000"
log "   Check status:  pm2 status"
log "   View logs:     pm2 logs neon-reptilia"
log "   Health check:  curl http://localhost:3000/health"
