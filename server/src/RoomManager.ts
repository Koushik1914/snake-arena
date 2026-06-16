import { WebSocket } from 'ws';
import { encode, decode } from '@msgpack/msgpack';
import { MessageType } from 'snake-arena-shared/protocol';
import { MAX_PLAYERS_PER_ROOM, HEARTBEAT_TIMEOUT } from 'snake-arena-shared/constants';
import { Room } from './Room';
import { PlayerConnection } from './PlayerConnection';

/**
 * RoomManager is a thin coordinator responsible for:
 *   - Creating and tracking rooms
 *   - Routing WebSocket messages to the correct room
 *   - Handling disconnects and heartbeat monitoring
 *
 * All game simulation is delegated to Room → C++ GameEngine.
 */
export class RoomManager {
  private rooms:          Map<string, Room>             = new Map();
  private socketToPlayer: Map<WebSocket, PlayerConnection> = new Map();

  constructor() {
    this.startHeartbeatCheck();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Room Operations
  // ───────────────────────────────────────────────────────────────────────────

  public createRoom(socket: WebSocket, nickname: string): Room {
    // Generate unique 6-character uppercase room code
    let code = '';
    do {
      code = Math.random().toString(36).substring(2, 8).toUpperCase();
    } while (this.rooms.has(code));

    const room = new Room(code, (emptyCode) => {
      this.rooms.delete(emptyCode);
      console.log(`[Room ${emptyCode}] Cleaned up (empty).`);
    });

    this.rooms.set(code, room);
    console.log(`[Room ${code}] Created by "${nickname}".`);

    const conn = room.addPlayer(socket, nickname);
    this.socketToPlayer.set(socket, conn);
    return room;
  }

  public joinRoom(socket: WebSocket, code: string, nickname: string): Room | string {
    const normalizedCode = code.trim().toUpperCase();
    const room = this.rooms.get(normalizedCode);

    if (!room)                              return 'Room not found.';
    if (room.players.size >= MAX_PLAYERS_PER_ROOM) return `Room is full (max ${MAX_PLAYERS_PER_ROOM} players).`;

    const conn = room.addPlayer(socket, nickname);
    this.socketToPlayer.set(socket, conn);
    console.log(`[Room ${normalizedCode}] "${nickname}" joined (${room.players.size}/${MAX_PLAYERS_PER_ROOM}).`);
    return room;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // WebSocket Event Handlers
  // ───────────────────────────────────────────────────────────────────────────

  public handleDisconnect(socket: WebSocket) {
    const conn = this.socketToPlayer.get(socket);
    if (!conn) return;

    console.log(`[Room ${conn.roomCode}] "${conn.nickname}" disconnected.`);
    const room = this.rooms.get(conn.roomCode);
    if (room) room.removePlayer(conn.id);
    this.socketToPlayer.delete(socket);
  }

  public handleMessage(socket: WebSocket, rawBuffer: ArrayBuffer | Buffer) {
    try {
      const data    = rawBuffer instanceof ArrayBuffer ? new Uint8Array(rawBuffer) : new Uint8Array(rawBuffer);
      const decoded = decode(data) as unknown[];
      if (!Array.isArray(decoded) || decoded.length === 0) return;

      const type = decoded[0] as MessageType;
      const conn = this.socketToPlayer.get(socket);

      switch (type) {

        // ── Client requests to create a new private room ──────────────────
        case MessageType.C_CREATE_ROOM: {
          const nickname = String(decoded[1] || 'Player');
          // Cleanly leave any previous room first
          if (conn) this.handleDisconnect(socket);
          this.createRoom(socket, nickname);
          break;
        }

        // ── Client requests to join an existing room ──────────────────────
        case MessageType.C_JOIN_ROOM: {
          const roomCode = String(decoded[1] || '');
          const nickname = String(decoded[2] || 'Player');
          if (conn) this.handleDisconnect(socket);
          const result = this.joinRoom(socket, roomCode, nickname);
          if (typeof result === 'string') {
            socket.send(encode([MessageType.S_ERROR, result]));
          }
          break;
        }

        // ── Client sends input (angle + boost + sequence number) ──────────
        // Packet: [C_INPUT, seq, angle, boost]
        case MessageType.C_INPUT: {
          if (!conn) return;
          const seq   = Number(decoded[1]) || 0;
          const angle = Number(decoded[2]) || 0;
          const boost = Boolean(decoded[3]);
          const room  = this.rooms.get(conn.roomCode);
          if (room) room.queueInput(conn.id, seq, angle, boost);
          break;
        }

        // ── Client ping (latency measurement) ────────────────────────────
        case MessageType.C_PING: {
          if (conn) conn.lastPing = Date.now();
          const ts = decoded[1];
          socket.send(encode([MessageType.S_PONG, ts]));
          break;
        }

        // ── Client requests to rejoin after elimination ───────────────────
        case MessageType.C_REJOIN: {
          if (!conn || conn.isAlive) return;
          const room = this.rooms.get(conn.roomCode);
          if (room) {
            conn.isAlive      = true;
            conn.lastInputSeq = 0;
            // Re-spawn the snake in the C++ engine with the same player ID
            room.engine.addPlayer(conn.id, conn.nickname);
            socket.send(encode([
              MessageType.S_ROOM_JOINED,
              room.code,
              conn.id,
              room.engine.mapSize,
              conn.nickname,
            ]));
          }
          break;
        }
      }
    } catch (err) {
      console.error('[RoomManager] Error handling message:', err);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Health / Heartbeat
  // ───────────────────────────────────────────────────────────────────────────

  private startHeartbeatCheck() {
    // Terminate connections that haven't pinged within HEARTBEAT_TIMEOUT ms
    setInterval(() => {
      const now = Date.now();
      for (const [socket, conn] of this.socketToPlayer.entries()) {
        if (now - conn.lastPing > HEARTBEAT_TIMEOUT) {
          console.log(`[Room ${conn.roomCode}] "${conn.nickname}" timed out (no ping).`);
          socket.terminate();
          this.handleDisconnect(socket);
        }
      }
    }, 10_000);
  }
}
