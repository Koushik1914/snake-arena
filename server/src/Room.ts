import { WebSocket } from 'ws';
import { encode } from '@msgpack/msgpack';
import { MessageType } from 'snake-arena-shared/protocol';
import { MAX_PLAYERS_PER_ROOM, TICK_RATE, MAP_SIZE } from 'snake-arena-shared/constants';
import { PlayerConnection } from './PlayerConnection';

import { GameEngineJS } from './game/GameEngineJS';

// Try to load native C++ Game Engine addon (compiled via node-gyp)
let GameEngine: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nativeAddon = require('../build/Release/game_engine.node');
  GameEngine = nativeAddon.GameEngine;
  console.log('[Room] Loaded native C++ GameEngine addon.');
} catch (e) {
  console.warn('[Room] Could not load native C++ GameEngine addon. Falling back to GameEngineJS (TypeScript).');
  GameEngine = GameEngineJS;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pending Input (buffered per player between ticks)
// ─────────────────────────────────────────────────────────────────────────────
interface PendingInput {
  seq:    number;
  angle:  number;
  boost:  boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Room Class
// Owns: C++ engine instance, tick loop, player connections, broadcasting
// ─────────────────────────────────────────────────────────────────────────────
export class Room {
  public  code:    string;
  public  players: Map<string, PlayerConnection> = new Map();
  public  engine:  any;

  /** Called when last player disconnects so RoomManager can clean up. */
  private onRoomEmpty: (code: string) => void;

  // High-precision tick timing
  private lastTickHrTime: bigint = process.hrtime.bigint();
  private timer: ReturnType<typeof setTimeout> | null = null;

  // Per-player input queue: buffered inputs arrive between server ticks
  private inputQueue: Map<string, PendingInput> = new Map();

  constructor(code: string, onRoomEmpty: (code: string) => void) {
    this.code        = code;
    this.onRoomEmpty = onRoomEmpty;

    // Instantiate the C++ authoritative engine
    this.engine = new GameEngine(MAP_SIZE);
    this.start();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Tick Loop
  // ───────────────────────────────────────────────────────────────────────────

  public start() {
    this.lastTickHrTime = process.hrtime.bigint();
    const tickMs = 1000 / TICK_RATE; // 33.33 ms at 30 TPS
    let nextTickMs = Date.now() + tickMs;

    const runTick = () => {
      const nowHr  = process.hrtime.bigint();
      const dtNs   = nowHr - this.lastTickHrTime;
      const dt     = Number(dtNs) / 1_000_000_000; // nanoseconds → seconds
      this.lastTickHrTime = nowHr;

      // Clamp dt to prevent spiral-of-death on system suspend
      const clampedDt = Math.min(dt, 0.1);

      // 1. Flush input queue into C++ engine (all inputs since last tick)
      this.flushInputQueue();

      // 2. Step the authoritative simulation
      const eliminations: Array<{
        playerId:   string;
        score:      number;
        rank:       number;
        killerName: string;
      }> = this.engine.update(clampedDt);

      // 3. Handle eliminations before broadcasting
      for (const elim of eliminations) {
        this.handlePlayerEliminated(elim.playerId, elim.score, elim.rank, elim.killerName);
      }

      // 4. Broadcast authoritative state to all live connections
      this.broadcastState();

      // 5. Schedule next tick with drift compensation
      const drift = Date.now() - nextTickMs;
      nextTickMs += tickMs;
      this.timer = setTimeout(runTick, Math.max(0, tickMs - drift));
    };

    this.timer = setTimeout(runTick, tickMs);
  }

  public stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Player Management
  // ───────────────────────────────────────────────────────────────────────────

  public addPlayer(socket: WebSocket, nickname: string): PlayerConnection {
    const playerId = Math.random().toString(36).substring(2, 9);
    const conn: PlayerConnection = {
      socket,
      id:           playerId,
      nickname,
      roomCode:     this.code,
      isAlive:      true,
      lastPing:     Date.now(),
      lastInputSeq: 0,
    };

    this.players.set(playerId, conn);

    // Spawn the snake in the authoritative C++ engine
    this.engine.addPlayer(playerId, nickname);

    // Send S_ROOM_JOINED confirmation: [type, roomCode, playerId, mapSize, nickname]
    const joinMsg = encode([MessageType.S_ROOM_JOINED, this.code, playerId, this.engine.mapSize, nickname]);
    socket.send(joinMsg);

    return conn;
  }

  public removePlayer(playerId: string) {
    if (this.players.has(playerId)) {
      this.engine.removePlayer(playerId);
      this.players.delete(playerId);
      this.inputQueue.delete(playerId);
    }

    if (this.players.size === 0) {
      this.destroy();
    }
  }

  /**
   * Buffer an incoming input. Only the most recent input per player is kept
   * per tick (inputs arrive faster than 30 TPS). The latest wins.
   */
  public queueInput(playerId: string, seq: number, angle: number, boost: boolean) {
    const conn = this.players.get(playerId);
    if (!conn || !conn.isAlive) return;
    conn.lastInputSeq = seq;
    this.inputQueue.set(playerId, { seq, angle, boost });
  }

  public destroy() {
    this.stop();
    this.players.clear();
    this.inputQueue.clear();
    this.onRoomEmpty(this.code);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ───────────────────────────────────────────────────────────────────────────

  private flushInputQueue() {
    for (const [playerId, input] of this.inputQueue.entries()) {
      this.engine.handleInput(playerId, input.angle, input.boost);
    }
    this.inputQueue.clear();
  }

  private handlePlayerEliminated(
    playerId:   string,
    score:      number,
    rank:       number,
    killerName: string,
  ) {
    const conn = this.players.get(playerId);
    if (!conn) return;

    conn.isAlive = false;

    // Notify the eliminated player: [S_ELIMINATED, score, rank, killerName]
    if (conn.socket.readyState === WebSocket.OPEN) {
      conn.socket.send(encode([MessageType.S_ELIMINATED, score, rank, killerName]));
    }
  }

  /**
   * Broadcasts per-player game state (viewport-culled) + shared leaderboard.
   *
   * Protocol:  S_GAME_STATE = [13, tick, ackSeq, players, foodAdded, foodRemoved, events]
   * The C++ engine serializes directly into MessagePack binary for maximum throughput.
   */
  private broadcastState() {
    if (this.players.size === 0) return;

    // Shared leaderboard is the same bytes for everyone
    const leaderboardBuffer: Buffer = this.engine.getSerializedLeaderboard();

    for (const [id, conn] of this.players.entries()) {
      if (conn.socket.readyState !== WebSocket.OPEN) continue;

      // Per-player state: viewport-culled, with their ACK seq embedded
      const stateBuffer: Buffer = this.engine.getSerializedState(id, conn.lastInputSeq);
      conn.socket.send(stateBuffer);
      conn.socket.send(leaderboardBuffer);
    }
  }
}
