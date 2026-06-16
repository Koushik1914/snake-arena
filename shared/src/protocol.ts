/**
 * ============================================================
 * Shared Network Protocol — Neon Reptilia Snake Arena
 * ============================================================
 * Single source of truth for all client↔server packet types.
 * NEVER import this from server path; always import from 'snake-arena-shared'.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Message Type Enum
// ─────────────────────────────────────────────────────────────────────────────

export enum MessageType {
  // Client → Server
  C_CREATE_ROOM = 1,
  C_JOIN_ROOM   = 2,
  C_INPUT       = 3,  // [type, seq_u16, angle_f32, boost_bool]
  C_PING        = 4,  // [type, clientTimestamp]
  C_REJOIN      = 5,  // [type]

  // Server → Client
  S_ROOM_CREATED = 10, // [type, roomCode]
  S_ROOM_JOINED  = 11, // [type, roomCode, playerId, mapSize, nickname]
  S_ERROR        = 12, // [type, errorMessage]
  S_GAME_STATE   = 13, // [type, tick, ackSeq, players, foodAdded, foodRemoved, events]
  S_LEADERBOARD  = 14, // [type, leaderboardData]
  S_ELIMINATED   = 15, // [type, score, rank, killerName]
  S_PONG         = 16, // [type, clientTimestamp]
}

// ─────────────────────────────────────────────────────────────────────────────
// Client → Server Packet Shapes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input packet sent every frame.
 * seq: monotonically increasing sequence number for reconciliation.
 * angle: radians [-PI, PI].
 * boost: whether the boost key is held.
 */
export type InputPacket = [
  type:   MessageType.C_INPUT,
  seq:    number,  // u16 — wraps at 65535
  angle:  number,  // f32
  boost:  boolean,
];

// ─────────────────────────────────────────────────────────────────────────────
// Server → Client Packet Shapes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compact array representation of a single player's state.
 * [id, name, color, mass, isBoosting, segments, inputSeqAck]
 * inputSeqAck: the last input seq the server processed for this player.
 */
export type PlayerStateData = [
  id:          string,           // 0: player UUID
  name:        string,           // 1: display name
  color:       string,           // 2: hex color e.g. "#00f0ff"
  mass:        number,           // 3: current mass (integer)
  isBoosting:  boolean,          // 4: boost state
  segments:    [number, number][], // 5: [[x, y], …]
  inputSeqAck: number,           // 6: last server-processed input sequence
];

/**
 * Food item (compact array form).
 * [id, x, y, mass, color]
 */
export type FoodStateData = [
  id:    number, // 0: unique food ID
  x:     number, // 1: world x (integer)
  y:     number, // 2: world y (integer)
  mass:  number, // 3: food mass (integer)
  color: string, // 4: hex color
];

/**
 * Leaderboard entry: [name, score]
 */
export type LeaderboardEntryData = [
  name:  string,
  score: number,
];

/**
 * Game events emitted in a tick.
 * "elimination": [type, headX, headY, snakeColor, score]
 * "food_eaten":  [type, foodId, headX, headY]
 */
export type GameEventData = [
  eventName: string,
  ...details: unknown[],
];

/**
 * Full game state packet payload (decoded array fields after type byte).
 * [tick, ackSeq, players, foodAdded, foodRemoved, events]
 */
export type GameStatePacket = [
  tick:        number,              // server tick counter
  ackSeq:      number,              // last acked input seq for the receiving player
  players:     PlayerStateData[],   // all snakes in the room
  foodAdded:   FoodStateData[],     // food that appeared this tick
  foodRemoved: number[],            // IDs of food consumed/removed this tick
  events:      GameEventData[],     // elimination, food_eaten, etc.
];
