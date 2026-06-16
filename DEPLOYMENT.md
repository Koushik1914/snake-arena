# 🚀 Snake Arena — Production Deployment Guide

This guide covers deploying Snake Arena on an **Ubuntu 22.04 VPS** with Nginx as a reverse proxy, PM2 for process management, and optional HTTPS via Let's Encrypt.

---

## Prerequisites

- Ubuntu 22.04 server (1 GB RAM minimum, 2 GB recommended)
- A domain name pointing to your server's IP (for HTTPS)
- SSH access with sudo privileges

---

## Option A — Docker Compose (Easiest)

### 1. Install Docker

```bash
curl -fsSL https://get.docker.com | bash
sudo usermod -aG docker $USER
newgrp docker
```

### 2. Install Docker Compose

```bash
sudo apt-get install -y docker-compose-plugin
docker compose version
```

### 3. Clone and Start

```bash
git clone https://github.com/Koushik1914/snake-arena.git
cd snake-arena

# Start both game server + nginx in background
docker compose up --build -d

# Check status
docker compose ps
docker compose logs -f
```

The game is now live at **http://your-server-ip**.

### 4. Update the Deployment

```bash
git pull
docker compose up --build -d
```

---

## Option B — Bare Metal with PM2 (Maximum Performance)

### 1. Install Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential python3
node --version  # Should be v20.x
```

### 2. Install PM2

```bash
sudo npm install -g pm2
```

### 3. Clone and Deploy

```bash
git clone https://github.com/Koushik1914/snake-arena.git
cd snake-arena

# One-command deploy
chmod +x deploy.sh
./deploy.sh
```

### 4. Verify

```bash
pm2 status                          # Should show neon-reptilia online
curl http://localhost:3000/health   # Should return {"status":"ok"}
pm2 logs neon-reptilia --lines 20  # View recent logs
```

### 5. Install and Configure Nginx

```bash
sudo apt-get install -y nginx

# Copy the HTTP config (or nginx.conf for HTTPS)
sudo cp nginx.http.conf /etc/nginx/nginx.conf

# Test and reload
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl start nginx
```

The game is now live at **http://your-server-ip**.

---

## Enabling HTTPS with Let's Encrypt

### 1. Install Certbot

```bash
sudo apt-get install -y certbot python3-certbot-nginx
```

### 2. Obtain Certificate

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### 3. Update Nginx Config

Edit `nginx.conf` and replace:
```nginx
ssl_certificate     /etc/nginx/ssl/cert.pem;
ssl_certificate_key /etc/nginx/ssl/key.pem;
```
with:
```nginx
ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
```

Then copy and reload:
```bash
sudo cp nginx.conf /etc/nginx/nginx.conf
sudo nginx -t && sudo systemctl reload nginx
```

### 4. Auto-Renewal

Certbot installs a cron job automatically. Verify it works:
```bash
sudo certbot renew --dry-run
```

---

## Firewall Setup

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

---

## Useful PM2 Commands

```bash
pm2 status                    # Show all processes
pm2 logs neon-reptilia        # Stream logs
pm2 reload neon-reptilia      # Zero-downtime reload
pm2 restart neon-reptilia     # Hard restart
pm2 stop neon-reptilia        # Stop the server
pm2 monit                     # Real-time monitoring dashboard
```

---

## Environment Variables

Create `server/.env` on your server:

```bash
cp .env.example server/.env
nano server/.env
```

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `NODE_ENV` | Set to `production` |
| `MAX_ROOMS` | Max concurrent game rooms |
| `MAX_PLAYERS_PER_ROOM` | Players per room |
| `TICK_RATE` | Simulation ticks/second |

---

## Updating the Game

```bash
cd snake-arena
git pull
./deploy.sh   # Rebuilds and does a zero-downtime PM2 reload
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| C++ addon fails to build | `sudo apt-get install build-essential python3` |
| Port 3000 already in use | `lsof -i :3000` then `kill <PID>` |
| Nginx 502 Bad Gateway | Check `pm2 status` — server may be down |
| WebSocket not connecting | Ensure `/ws` location block is in nginx config |
| High memory usage | Adjust `max_memory_restart` in `ecosystem.config.js` |
