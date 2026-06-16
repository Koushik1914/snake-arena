import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { RoomManager } from './RoomManager';

const app         = express();
const server      = http.createServer(app);
const wss         = new WebSocketServer({ noServer: true });
const roomManager = new RoomManager();

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limiting (per-socket)
// Prevents input spam from flooding the server.
// ─────────────────────────────────────────────────────────────────────────────
const MESSAGE_RATE_LIMIT = 200; // max messages per second per socket
const socketMessageCounts = new Map<WebSocket, number>();

setInterval(() => {
  socketMessageCounts.clear();
}, 1000);

// ─────────────────────────────────────────────────────────────────────────────
// WebSocket Upgrade
// ─────────────────────────────────────────────────────────────────────────────
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;

  if (pathname === '/ws' || pathname === '/') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (socket: WebSocket) => {
  socket.binaryType = 'arraybuffer';
  socketMessageCounts.set(socket, 0);

  socket.on('message', (message: Buffer | ArrayBuffer) => {
    // Rate limit check
    const count = (socketMessageCounts.get(socket) || 0) + 1;
    socketMessageCounts.set(socket, count);
    if (count > MESSAGE_RATE_LIMIT) return; // silently drop excess

    roomManager.handleMessage(socket, message as ArrayBuffer);
  });

  socket.on('close', () => {
    socketMessageCounts.delete(socket);
    roomManager.handleDisconnect(socket);
  });

  socket.on('error', (err) => {
    console.error('[WS] Socket error:', err);
    roomManager.handleDisconnect(socket);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Health Check Endpoint
// ─────────────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: Date.now() });
});

// ─────────────────────────────────────────────────────────────────────────────
// Static Frontend (production)
// ─────────────────────────────────────────────────────────────────────────────
const clientDistPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
    if (err) {
      res.status(200).send('Snake Arena Server is running. Start client in dev mode to play.');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Startup & Graceful Shutdown
// ─────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('==========================================');
  console.log('  NEON REPTILIA — GAME SERVER RUNNING    ');
  console.log(`  Port:        ${PORT}                   `);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('==========================================');
});

// Graceful shutdown: let open connections drain before exit
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received — shutting down gracefully.');
  server.close(() => {
    console.log('[Server] All connections closed. Exiting.');
    process.exit(0);
  });
  // Force exit after 10 seconds if connections don't drain
  setTimeout(() => process.exit(1), 10_000);
});
