/**
 * ============================================================
 * Shared Game Constants — Neon Reptilia Snake Arena
 * ============================================================
 * These values MUST match the corresponding constants in the
 * C++ game engine (snake.h / game_engine.h) exactly.
 * The client uses these for client-side prediction physics.
 */

// ─────────────────────────────────────────────────────────────────────────────
// World
// ─────────────────────────────────────────────────────────────────────────────
export const MAP_SIZE          = 6000;   // World size in units (square)
export const ARENA_RADIUS      = 3000;   // Radius of circular arena boundary
export const TARGET_FOOD_COUNT = 3500;   // Target food particles in the world
export const TICK_RATE         = 30;     // Server ticks per second

// ─────────────────────────────────────────────────────────────────────────────
// Snake Physics (MUST mirror snake.h)
// ─────────────────────────────────────────────────────────────────────────────
export const SNAKE_BASE_LENGTH       = 15;    // Initial segment count
export const SNAKE_BASE_RADIUS       = 8.0;   // Minimum snake radius (units)
export const SNAKE_RADIUS_FACTOR     = 0.55;  // radius += sqrt(mass) * factor
export const SNAKE_BASE_SPEED        = 180.0; // Base movement speed (units/sec)
export const SNAKE_BOOST_MULTIPLIER  = 2.5;   // Speed multiplier while boosting
export const SNAKE_BOOST_MASS_LOSS   = 20.0;  // Mass lost per second while boosting
export const SNAKE_MIN_BOOST_MASS    = 50.0;  // Minimum mass to be able to boost
export const SNAKE_INITIAL_MASS      = 50.0;  // Starting mass
export const SNAKE_MASS_PER_SEGMENT  = 5.0;   // Mass required to grow one segment
export const SNAKE_BASE_TURN_SPEED   = 4.5;   // Max radians/sec turn rate (at low mass)

// ─────────────────────────────────────────────────────────────────────────────
// Food
// ─────────────────────────────────────────────────────────────────────────────
export const FOOD_MAGNET_RANGE  = 80.0;  // Extra range beyond head radius for magnetism
export const FOOD_MAGNET_SPEED  = 450.0; // Max magnetization pull speed (units/sec)
export const FOOD_EAT_THRESHOLD = 5.0;   // Extra radius on top of head for eating

// ─────────────────────────────────────────────────────────────────────────────
// Networking
// ─────────────────────────────────────────────────────────────────────────────
export const INPUT_SEQ_MAX       = 65535; // u16 wrap-around
export const INPUT_HISTORY_SIZE  = 128;   // Ring buffer depth for reconciliation
export const INTERPOLATION_DELAY = 100;   // ms behind real-time for remote snakes
export const MAX_PLAYERS_PER_ROOM = 10;
export const HEARTBEAT_INTERVAL  = 5000;  // ms between pings
export const HEARTBEAT_TIMEOUT   = 25000; // ms before disconnect
