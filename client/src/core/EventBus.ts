/**
 * EventBus — Typed publish/subscribe system.
 *
 * Decouples subsystems: NetworkClient emits events, GameApp and LobbyUI
 * subscribe to them. Eliminates the need for callback spaghetti.
 *
 * Usage:
 *   const bus = new EventBus();
 *   bus.on('roomJoined', ({ roomCode }) => ...);
 *   bus.emit('roomJoined', { roomCode: 'ABC123', ... });
 */

import type { GameStatePacket, LeaderboardEntryData } from 'snake-arena-shared/protocol';

// ─────────────────────────────────────────────────────────────────────────────
// Event Map (all game events and their payload types)
// ─────────────────────────────────────────────────────────────────────────────
export interface GameEvents {
  connected:      void;
  disconnected:   { code: number; reason: string };
  networkError:   { message: string };
  roomJoined:     { roomCode: string; playerId: string; name: string; mapSize: number };
  roomCreated:    { roomCode: string };
  eliminated:     { score: number; rank: number; killerName: string };
  gameState:      GameStatePacket;
  leaderboard:    { entries: LeaderboardEntryData[] };
  latencyUpdate:  { ms: number };
}

type Handler<T> = (payload: T) => void;

// ─────────────────────────────────────────────────────────────────────────────
// EventBus Implementation
// ─────────────────────────────────────────────────────────────────────────────
export class EventBus {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handlers = new Map<string, Set<Handler<any>>>();

  public on<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  public once<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): void {
    const unsub = this.on(event, (payload) => {
      unsub();
      handler(payload);
    });
  }

  public emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    const eventHandlers = this.handlers.get(event);
    if (!eventHandlers) return;
    for (const handler of eventHandlers) {
      handler(payload);
    }
  }

  public off<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): void {
    this.handlers.get(event)?.delete(handler);
  }

  public clear(): void {
    this.handlers.clear();
  }
}
