import { encode, decode } from '@msgpack/msgpack';
import { MessageType, PlayerStateData, FoodStateData, GameEventData } from '../../../server/src/types/protocol';

export interface RemoteSnakeState {
  id: string;
  name: string;
  color: string;
  mass: number;
  isBoosting: boolean;
  segments: { x: number; y: number }[];
  history: { time: number; segments: [number, number][] }[];
}

export interface FoodItemState {
  id: number;
  x: number;
  y: number;
  mass: number;
  color: string;
}

export class NetworkClient {
  private socket: WebSocket | null = null;
  
  // Latency metrics
  public latency: number = 0;
  private pingInterval: any = null;

  // Active game variables
  public localPlayerId: string = '';
  public localPlayerName: string = '';
  public roomCode: string = '';
  public mapSize: number = 4000;
  
  // States parsed from server
  public snakes: Map<string, RemoteSnakeState> = new Map();
  public food: Map<number, FoodItemState> = new Map();
  public events: GameEventData[] = [];
  public leaderboard: [string, number][] = [];

  // Connection events
  public onOpen?: () => void;
  public onClose?: (code: number, reason: string) => void;
  public onError?: (err: Event) => void;
  
  // Game state events
  public onRoomCreated?: (code: string) => void;
  public onRoomJoined?: (code: string, playerId: string, name: string) => void;
  public onElimination?: (score: number, rank: number, killerName: string) => void;
  public onServerStateReceived?: () => void;
  public onNetworkError?: (msg: string) => void;

  constructor() {}

  public connect(url: string) {
    this.disconnect();

    this.socket = new WebSocket(url);
    this.socket.binaryType = 'arraybuffer';

    this.socket.onopen = () => {
      if (this.onOpen) this.onOpen();
      this.startPinging();
    };

    this.socket.onclose = (e) => {
      this.stopPinging();
      if (this.onClose) this.onClose(e.code, e.reason);
    };

    this.socket.onerror = (e) => {
      if (this.onError) this.onError(e);
    };

    this.socket.onmessage = (e: MessageEvent) => {
      this.handleBinaryMessage(e.data);
    };
  }

  public disconnect() {
    this.stopPinging();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  public isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  public createRoom(nickname: string) {
    this.localPlayerName = nickname;
    this.send(MessageType.C_CREATE_ROOM, [nickname]);
  }

  public joinRoom(roomCode: string, nickname: string) {
    this.localPlayerName = nickname;
    this.send(MessageType.C_JOIN_ROOM, [roomCode, nickname]);
  }

  public sendInput(angle: number, isBoosting: boolean) {
    this.send(MessageType.C_INPUT, [angle, isBoosting]);
  }

  public rejoin() {
    this.send(MessageType.C_REJOIN, []);
  }

  private send(type: MessageType, data: any[]) {
    if (!this.isConnected()) return;
    const payload = encode([type, ...data]);
    this.socket!.send(payload);
  }

  private startPinging() {
    this.pingInterval = setInterval(() => {
      this.send(MessageType.C_PING, [Date.now()]);
    }, 5000);
  }

  private stopPinging() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private handleBinaryMessage(buffer: ArrayBuffer) {
    try {
      const decoded = decode(new Uint8Array(buffer)) as any[];
      if (!Array.isArray(decoded) || decoded.length === 0) return;

      const type = decoded[0] as MessageType;

      switch (type) {
        case MessageType.S_ROOM_CREATED: {
          const [code] = decoded.slice(1);
          this.roomCode = code;
          if (this.onRoomCreated) this.onRoomCreated(code);
          break;
        }

        case MessageType.S_ROOM_JOINED: {
          const [code, pId, mSize, name] = decoded.slice(1);
          this.roomCode = code;
          this.localPlayerId = pId;
          this.localPlayerName = name;
          this.mapSize = mSize;
          
          this.snakes.clear();
          this.food.clear();
          this.events = [];
          
          if (this.onRoomJoined) this.onRoomJoined(code, pId, name);
          break;
        }

        case MessageType.S_ERROR: {
          const [errMsg] = decoded.slice(1);
          if (this.onNetworkError) this.onNetworkError(errMsg);
          break;
        }

        case MessageType.S_GAME_STATE: {
          const [tick, playersData, foodData, eventsData] = decoded.slice(1);
          this.processGameState(tick, playersData, foodData, eventsData);
          break;
        }

        case MessageType.S_LEADERBOARD: {
          const [leaderboardData] = decoded.slice(1);
          this.leaderboard = leaderboardData || [];
          break;
        }

        case MessageType.S_ELIMINATED: {
          const [score, rank, killerName] = decoded.slice(1);
          if (this.onElimination) this.onElimination(score, rank, killerName);
          break;
        }

        case MessageType.S_PONG: {
          const [sentTime] = decoded.slice(1);
          this.latency = Date.now() - sentTime;
          break;
        }
      }
    } catch (err) {
      console.error("Network decode error:", err);
    }
  }

  private processGameState(
    _tick: number,
    playersData: PlayerStateData[],
    foodData: FoodStateData[],
    eventsData: GameEventData[]
  ) {
    const now = Date.now();
    this.events = eventsData || [];

    // 1. Process Snake Updates
    const activeIds = new Set<string>();

    playersData.forEach((pData) => {
      const [id, name, color, mass, isBoosting, segmentsArr] = pData;
      activeIds.add(id);

      const existing = this.snakes.get(id);
      
      if (!existing) {
        // New snake entering game
        this.snakes.set(id, {
          id,
          name,
          color,
          mass,
          isBoosting,
          segments: segmentsArr.map(([x, y]) => ({ x, y })),
          history: [{ time: now, segments: segmentsArr }]
        });
      } else {
        // Update mass and boost directly
        existing.mass = mass;
        existing.isBoosting = isBoosting;

        // Push new server position into remote history buffer
        existing.history.push({ time: now, segments: segmentsArr });

        // Cap history to keep memory footprint low
        if (existing.history.length > 15) {
          existing.history.shift();
        }

        // If local player, perform soft reconciliation/client-side prediction alignment
        if (id === this.localPlayerId) {
          const serverHeadX = segmentsArr[0][0];
          const serverHeadY = segmentsArr[0][1];
          const localHead = existing.segments[0];

          const dx = serverHeadX - localHead.x;
          const dy = serverHeadY - localHead.y;
          const errorDist = Math.sqrt(dx * dx + dy * dy);

          // If local prediction diverges significantly (due to latency spike/collision), snap
          if (errorDist > 80) {
            existing.segments = segmentsArr.map(([x, y]) => ({ x, y }));
          } else {
            // Otherwise, gently slide local prediction towards authoritative server coordinate
            // to avoid rendering jitters or visual snapping
            const lerpSpeed = 0.18;
            existing.segments.forEach((seg, idx) => {
              if (idx < segmentsArr.length) {
                seg.x += (segmentsArr[idx][0] - seg.x) * lerpSpeed;
                seg.y += (segmentsArr[idx][1] - seg.y) * lerpSpeed;
              }
            });

            // Re-extend tail length if server has extra segments client has not spawned yet
            if (existing.segments.length < segmentsArr.length) {
              for (let i = existing.segments.length; i < segmentsArr.length; i++) {
                existing.segments.push({ x: segmentsArr[i][0], y: segmentsArr[i][1] });
              }
            }
          }
        }
      }
    });

    // Remove snakes that disconnected/were eliminated
    for (const [id] of this.snakes.entries()) {
      if (!activeIds.has(id)) {
        this.snakes.delete(id);
      }
    }

    // 2. Process Food Updates
    // Clear food and populate with the viewport food returned by the server
    this.food.clear();
    foodData.forEach((fData) => {
      const [id, x, y, mass, color] = fData;
      this.food.set(id, { id, x, y, mass, color });
    });

    if (this.onServerStateReceived) {
      this.onServerStateReceived();
    }
  }

  // Linear remote player interpolation loop (runs at client render ticks)
  public interpolateRemotePlayers() {
    const now = Date.now();
    // Interpolation offset: render remote players 100ms behind real-time
    const renderTime = now - 100;

    for (const [id, snake] of this.snakes.entries()) {
      // Skip local player (uses prediction)
      if (id === this.localPlayerId) continue;

      const history = snake.history;
      if (history.length < 2) continue;

      // Find the two history keys that surround renderTime
      let beforeIndex = -1;
      let afterIndex = -1;

      for (let i = 0; i < history.length - 1; i++) {
        if (history[i].time <= renderTime && history[i + 1].time >= renderTime) {
          beforeIndex = i;
          afterIndex = i + 1;
          break;
        }
      }

      if (beforeIndex !== -1 && afterIndex !== -1) {
        const stateA = history[beforeIndex];
        const stateB = history[afterIndex];
        const t = (renderTime - stateA.time) / (stateB.time - stateA.time);

        // Interpolate all segments
        const interpolatedSegments: { x: number; y: number }[] = [];
        const numSegments = Math.min(stateA.segments.length, stateB.segments.length);

        for (let idx = 0; idx < numSegments; idx++) {
          const ax = stateA.segments[idx][0];
          const ay = stateA.segments[idx][1];
          const bx = stateB.segments[idx][0];
          const by = stateB.segments[idx][1];

          interpolatedSegments.push({
            x: ax + t * (bx - ax),
            y: ay + t * (by - ay)
          });
        }
        
        snake.segments = interpolatedSegments;
      } else {
        // Fallback: if renderTime is ahead of our history, use the latest server state directly
        const latest = history[history.length - 1];
        snake.segments = latest.segments.map(([x, y]) => ({ x, y }));
      }
    }
  }
}
