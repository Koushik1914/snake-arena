import { encode, decode } from '@msgpack/msgpack';
import { MessageType, type LeaderboardEntryData } from 'snake-arena-shared/protocol';
import { HEARTBEAT_INTERVAL, INTERPOLATION_DELAY } from 'snake-arena-shared/constants';
import type { EventBus } from '../core/EventBus';
import type { InputSnapshot } from '../game/InputManager';

// ─────────────────────────────────────────────────────────────────────────────
// Remote entity state (used by interpolation system)
// ─────────────────────────────────────────────────────────────────────────────

export interface RemoteSnakeState {
  id:          string;
  name:        string;
  color:       string;
  mass:        number;
  isBoosting:  boolean;
  segments:    { x: number; y: number }[];
  // Interpolation history buffer
  history: Array<{
    time:     number;
    segments: [number, number][];
  }>;
}

export interface FoodItemState {
  id:    number;
  x:     number;
  y:     number;
  mass:  number;
  color: string;
}

/**
 * NetworkClient — Manages the WebSocket connection to the game server.
 *
 * Responsibilities:
 *   - WebSocket lifecycle (connect/disconnect/reconnect)
 *   - Sending player inputs with sequence numbers
 *   - Decoding MessagePack binary packets
 *   - Emitting typed events via EventBus
 *   - Remote entity interpolation (100ms delay)
 *   - Latency measurement (ping/pong)
 *
 * NOT responsible for:
 *   - Game logic or physics
 *   - Rendering
 *   - Room/lobby UI state
 */
export class NetworkClient {
  private socket: WebSocket | null = null;
  private bus:    EventBus;

  // ── Connection state ────────────────────────────────────────────────────────
  public localPlayerId:   string = '';
  public localPlayerName: string = '';
  public roomCode:        string = '';
  public mapSize:         number = 4000;
  public latency:         number = 0;

  // ── Game state (updated every server tick) ──────────────────────────────────
  public snakes:      Map<string, RemoteSnakeState>  = new Map();
  public food:        Map<number, FoodItemState>     = new Map();
  public leaderboard: LeaderboardEntryData[]         = [];
  public lastAckSeq:  number = 0; // Last server-acknowledged input seq for local player

  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(bus: EventBus) {
    this.bus = bus;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Connection Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  public connect(url: string): void {
    this.disconnect();

    this.socket = new WebSocket(url);
    this.socket.binaryType = 'arraybuffer';

    this.socket.onopen = () => {
      this.bus.emit('connected', undefined as never);
      this.startPing();
    };

    this.socket.onclose = (e) => {
      this.stopPing();
      this.bus.emit('disconnected', { code: e.code, reason: e.reason });
    };

    this.socket.onerror = () => {
      this.bus.emit('networkError', { message: 'WebSocket connection error.' });
    };

    this.socket.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      this.handleBinaryMessage(e.data);
    };
  }

  public disconnect(): void {
    this.stopPing();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  public isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Client → Server Messages
  // ─────────────────────────────────────────────────────────────────────────

  public createRoom(nickname: string): void {
    this.localPlayerName = nickname;
    this.send([MessageType.C_CREATE_ROOM, nickname]);
  }

  public joinRoom(roomCode: string, nickname: string): void {
    this.localPlayerName = nickname;
    this.send([MessageType.C_JOIN_ROOM, roomCode, nickname]);
  }

  /**
   * Send a stamped input snapshot to the server.
   * Packet: [C_INPUT, seq, angle, boost]
   */
  public sendInput(input: InputSnapshot): void {
    this.send([MessageType.C_INPUT, input.seq, input.angle, input.boost]);
  }

  public rejoin(): void {
    this.send([MessageType.C_REJOIN]);
  }

  private send(data: unknown[]): void {
    if (!this.isConnected()) return;
    this.socket!.send(encode(data));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Ping / Latency
  // ─────────────────────────────────────────────────────────────────────────

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      this.send([MessageType.C_PING, Date.now()]);
    }, HEARTBEAT_INTERVAL);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Message Decoding
  // ─────────────────────────────────────────────────────────────────────────

  private handleBinaryMessage(buffer: ArrayBuffer): void {
    try {
      const decoded = decode(new Uint8Array(buffer)) as unknown[];
      if (!Array.isArray(decoded) || decoded.length === 0) return;

      const type = decoded[0] as MessageType;

      switch (type) {

        case MessageType.S_ROOM_CREATED: {
          const roomCode = String(decoded[1]);
          this.roomCode = roomCode;
          this.bus.emit('roomCreated', { roomCode });
          break;
        }

        case MessageType.S_ROOM_JOINED: {
          const [, code, pId, mSize, name] = decoded as [unknown, string, string, number, string];
          this.roomCode        = code;
          this.localPlayerId   = pId;
          this.localPlayerName = name;
          this.mapSize         = mSize;
          this.lastAckSeq      = 0;
          // Clear stale state from previous session
          this.snakes.clear();
          this.food.clear();
          this.leaderboard = [];
          this.bus.emit('roomJoined', { roomCode: code, playerId: pId, name, mapSize: mSize });
          break;
        }

        case MessageType.S_ERROR: {
          const msg = String(decoded[1]);
          this.bus.emit('networkError', { message: msg });
          break;
        }

        /**
         * S_GAME_STATE: [13, tick, ackSeq, players, foodItems, events]
         * ackSeq is the last input the server processed for THIS player.
         */
        case MessageType.S_GAME_STATE: {
          const [, , ackSeq, playersData, foodData, events] = decoded as [
            unknown, number, number,
            [string, string, string, number, boolean, [number,number][], number][],
            [number, number, number, number, string][],
            [string, ...unknown[]][],
          ];
          this.lastAckSeq = ackSeq;
          this.processGameState(ackSeq, playersData, foodData, events as never);
          break;
        }

        case MessageType.S_LEADERBOARD: {
          this.leaderboard = (decoded[1] as LeaderboardEntryData[]) || [];
          this.bus.emit('leaderboard', { entries: this.leaderboard });
          break;
        }

        case MessageType.S_ELIMINATED: {
          const [, score, rank, killerName] = decoded as [unknown, number, number, string];
          this.bus.emit('eliminated', { score, rank, killerName });
          break;
        }

        case MessageType.S_PONG: {
          const sentTime = decoded[1] as number;
          this.latency = Date.now() - sentTime;
          this.bus.emit('latencyUpdate', { ms: this.latency });
          break;
        }
      }
    } catch (err) {
      console.error('[NetworkClient] Decode error:', err);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Game State Processing
  // ─────────────────────────────────────────────────────────────────────────

  private processGameState(
    ackSeq:      number,
    playersData: [string, string, string, number, boolean, [number,number][], number][],
    foodData:    [number, number, number, number, string][],
    events:      [string, ...unknown[]][],
  ): void {
    const now = Date.now();
    const activeIds = new Set<string>();

    // ── Update snake states ─────────────────────────────────────────────────
    for (const pData of playersData) {
      const [id, name, color, mass, isBoosting, segmentsArr] = pData;
      activeIds.add(id);

      const existing = this.snakes.get(id);
      if (!existing) {
        // New snake — initialize with current snapshot
        this.snakes.set(id, {
          id, name, color, mass, isBoosting,
          segments: segmentsArr.map(([x, y]) => ({ x, y })),
          history:  [{ time: now, segments: segmentsArr }],
        });
      } else {
        existing.name       = name;
        existing.color      = color;
        existing.mass       = mass;
        existing.isBoosting = isBoosting;

        // Push new server snapshot into interpolation history
        existing.history.push({ time: now, segments: segmentsArr });
        // Keep buffer small: 15 snapshots covers ~500ms at 30 TPS
        if (existing.history.length > 15) existing.history.shift();

        // For the local player: segments are maintained by PredictionEngine,
        // but we still need to update mass and boost for rendering.
        // The GameApp will call reconcile() on PredictionEngine separately.
      }
    }

    // Remove disconnected/eliminated snakes
    for (const [id] of this.snakes) {
      if (!activeIds.has(id)) this.snakes.delete(id);
    }

    // ── Update food (full viewport resend each tick from server) ────────────
    // Server sends the full viewport each tick for simplicity.
    // Future delta optimization can be added here.
    this.food.clear();
    for (const fData of foodData) {
      const [id, x, y, mass, color] = fData;
      this.food.set(id, { id, x, y, mass, color });
    }

    // Emit game state event as a raw tuple for GameApp to process
    // GameStatePacket tuple: [tick, ackSeq, players, foodAdded, foodRemoved, events]
    this.bus.emit('gameState', [
      0,
      ackSeq,
      playersData,
      foodData,
      [],
      events,
    ] as never);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Remote Entity Interpolation
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Interpolates remote snake positions using the history buffer.
   * Renders 100ms behind real-time to smooth over network jitter.
   * Call this every render frame for remote snakes only.
   */
  public interpolateRemotePlayers(): void {
    const renderTime = Date.now() - INTERPOLATION_DELAY;

    for (const [id, snake] of this.snakes) {
      // Local player is updated by PredictionEngine — skip
      if (id === this.localPlayerId) continue;

      const history = snake.history;
      if (history.length < 2) {
        // Not enough history: use latest snapshot directly
        if (history.length === 1) {
          snake.segments = history[0].segments.map(([x, y]) => ({ x, y }));
        }
        continue;
      }

      // Binary search for the two snapshots bracketing renderTime
      let before = -1;
      let after  = -1;
      for (let i = 0; i < history.length - 1; i++) {
        if (history[i].time <= renderTime && history[i + 1].time >= renderTime) {
          before = i;
          after  = i + 1;
          break;
        }
      }

      if (before !== -1) {
        // Interpolate between the two snapshots
        const stateA = history[before];
        const stateB = history[after];
        const t = (renderTime - stateA.time) / (stateB.time - stateA.time);
        const n = Math.min(stateA.segments.length, stateB.segments.length);

        const interp: { x: number; y: number }[] = [];
        for (let i = 0; i < n; i++) {
          interp.push({
            x: stateA.segments[i][0] + t * (stateB.segments[i][0] - stateA.segments[i][0]),
            y: stateA.segments[i][1] + t * (stateB.segments[i][1] - stateA.segments[i][1]),
          });
        }
        snake.segments = interp;
      } else {
        // renderTime is ahead of all history — use latest
        const latest = history[history.length - 1];
        snake.segments = latest.segments.map(([x, y]) => ({ x, y }));
      }
    }
  }
}
