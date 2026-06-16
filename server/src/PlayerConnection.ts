import { WebSocket } from 'ws';

/**
 * Represents the per-socket connection state for a player.
 * Manages: identity, room membership, liveness, input sequence tracking.
 */
export interface PlayerConnection {
  socket:      WebSocket;
  id:          string;      // Player UUID (matches C++ engine player ID)
  nickname:    string;
  roomCode:    string;
  isAlive:     boolean;     // False once eliminated (can rejoin)
  lastPing:    number;      // Unix ms of last received ping
  lastInputSeq: number;     // Last input sequence number received
}
