<div align="center">

# 🐍 Snake Arena

**A high-performance multiplayer snake game built for the modern web.**

[![Node.js](https://img.shields.io/badge/Node.js-20_LTS-339933?logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://typescriptlang.org)
[![PixiJS](https://img.shields.io/badge/PixiJS-7.x-e72264?logo=pixijs)](https://pixijs.com)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker)](https://docker.com)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[Play Demo](#) · [Report Bug](https://github.com/Koushik1914/snake-arena/issues) · [Request Feature](https://github.com/Koushik1914/snake-arena/issues)

</div>

---

## ✨ Features

- 🎮 **Real-time multiplayer** — native WebSocket with binary MessagePack frames
- ⚡ **60 FPS rendering** — PixiJS WebGL renderer with client-side prediction
- 🦎 **Smooth snake movement** — sinusoidal wobble animation with boost mechanics
- 🍎 **Dynamic food system** — small/medium/large food with glow effects
- 🗺️ **Live minimap** — throttled at 15 FPS for optimal performance
- 🔴 **Circular arena** — boundary warning system with particle effects
- 🧠 **C++ game engine** — N-API native addon for maximum simulation performance
- 🐳 **Docker ready** — multi-stage build with Nginx reverse proxy

## 🏗️ Architecture

```
Browser (PixiJS + TypeScript)
        │  WebSocket / WSS
        ▼
  Nginx Reverse Proxy
        │  HTTP / WS
        ▼
  Node.js Server (TypeScript)
        │  N-API
        ▼
  C++ Game Engine (snake.cpp / food.cpp / spatial_grid.cpp)
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | TypeScript, Vite, PixiJS (WebGL) |
| Backend | Node.js 20 LTS, native `ws` WebSockets |
| Game Sim | C++ (compiled as N-API native addon) |
| Serialization | MessagePack (binary) |
| Proxy | Nginx |
| Process Mgr | PM2 |
| Deployment | Docker, Ubuntu Linux |

## 📁 Project Structure

```
snake-arena/
├── client/                 # Frontend (Vite + TypeScript + PixiJS)
│   ├── src/
│   │   ├── game/           # Game loop, camera, prediction engine
│   │   ├── renderer/       # PixiJS renderers (snake, food, arena, minimap)
│   │   ├── ui/             # HUD, lobby UI
│   │   └── core/           # Event bus, object pool
│   ├── index.html
│   └── vite.config.ts
├── server/                 # Backend (Node.js + TypeScript)
│   ├── src/
│   │   ├── game/           # TypeScript game engine (JS fallback)
│   │   ├── native/         # C++ N-API game engine source
│   │   └── server.ts       # WebSocket server entry point
│   └── binding.gyp
├── shared/                 # Shared types and constants
│   └── src/
│       ├── constants.ts
│       └── protocol.ts
├── Dockerfile              # Multi-stage production build
├── docker-compose.yml      # Full stack orchestration
├── nginx.conf              # Nginx reverse proxy (HTTPS)
├── nginx.http.conf         # Nginx reverse proxy (HTTP, for staging)
├── ecosystem.config.js     # PM2 cluster config
└── deploy.sh               # One-command VPS deployment
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20 LTS
- npm 9+
- C++ build tools (`build-essential` on Ubuntu, Xcode CLT on macOS)
- Python 3 (for `node-gyp`)

### Local Development

```bash
# 1. Clone the repo
git clone https://github.com/Koushik1914/snake-arena.git
cd snake-arena

# 2. Install all dependencies
npm run bootstrap

# 3. Start both server and client in dev mode
npm run dev
```

- **Client**: http://localhost:5173
- **Server**: http://localhost:3000
- **Health check**: http://localhost:3000/health

### Environment Variables

Copy `.env.example` to `.env` in the `server/` directory and adjust as needed:

```bash
cp .env.example server/.env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server listening port |
| `NODE_ENV` | `development` | `development` or `production` |
| `MAX_ROOMS` | `10` | Maximum concurrent game rooms |
| `MAX_PLAYERS_PER_ROOM` | `20` | Players allowed per room |
| `TICK_RATE` | `20` | Server simulation ticks per second |

## 🐳 Docker Deployment

### Using Docker Compose (Recommended)

```bash
# Build and start (HTTP mode — no certs needed)
docker-compose -f docker-compose.yml up --build -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

The game will be available at **http://localhost**.

### With HTTPS (Production)

1. Place your SSL certificates in `./ssl/cert.pem` and `./ssl/key.pem`
2. Update `docker-compose.yml` to mount the `ssl/` volume and use `nginx.conf`
3. Run `docker-compose up --build -d`

## ☁️ VPS Deployment (Ubuntu)

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full step-by-step guide.

**TL;DR — one command:**

```bash
chmod +x deploy.sh && ./deploy.sh
```

This script will:
1. Install Node.js 20 LTS and build tools
2. Install PM2 globally
3. Build the server (including C++ addon) and client
4. Start the server with PM2 in cluster mode
5. Configure PM2 to auto-start on reboot

## 🎮 Gameplay

| Action | Control |
|--------|---------|
| Move | Mouse position |
| Boost | Left click / hold |
| Zoom | Automatic (based on snake size) |

### Game Mechanics

- **Grow** by eating food particles (small/medium/large)
- **Boost** to move faster — you drop food trails while boosting
- **Kill** other snakes by making them collide with your body
- **Stay inside** the circular arena — 3 seconds outside = elimination
- **Survive** and become the longest snake!

## 🔧 Development Scripts

```bash
npm run dev          # Start server + client in watch mode
npm run dev:server   # Server only
npm run dev:client   # Client only (Vite HMR)
npm run build        # Production build (client + server)
npm run build:client # Build frontend only
npm run build:server # Compile TypeScript + C++ addon
npm run start        # Start production server
```

## 📊 Performance

| Metric | Value |
|--------|-------|
| Server tick rate | 20 Hz |
| Client render rate | 60 FPS (requestAnimationFrame) |
| Protocol overhead | ~50–200 bytes/tick (MessagePack binary) |
| Spatial collision grid | O(1) average lookup |
| Minimap render rate | 15 FPS (throttled) |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

---

<div align="center">
  Made with ❤️ by <a href="https://github.com/Koushik1914">Koushik1914</a>
</div>
