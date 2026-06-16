import {
  SNAKE_BASE_SPEED,
  SNAKE_BOOST_MULTIPLIER,
  SNAKE_BASE_TURN_SPEED,
  SNAKE_BOOST_MASS_LOSS,
  SNAKE_MIN_BOOST_MASS,
  SNAKE_MASS_PER_SEGMENT,
  SNAKE_BASE_LENGTH,
  SNAKE_BASE_RADIUS,
  SNAKE_RADIUS_FACTOR,
  INPUT_HISTORY_SIZE,
  INPUT_SEQ_MAX,
} from 'snake-arena-shared/constants';
import type { InputSnapshot } from './InputManager';

export interface Segment { x: number; y: number; }

/**
 * The locally-predicted snake state.
 * This is what the client renders for the local player; it may diverge
 * slightly from the authoritative server state until reconciliation.
 */
export interface PredictedSnakeState {
  id:          string;
  angle:       number;   // current heading in radians
  mass:        number;
  isBoosting:  boolean;
  segments:    Segment[];
  pendingFood: number;   // pending boost food spawn accumulator
}

/**
 * PredictionEngine — Full rollback-and-replay client-side prediction.
 *
 * Algorithm (Quake/Valve-style):
 *   1. Every frame: apply input locally → move snake immediately.
 *   2. Push input into a fixed-size ring buffer of unacknowledged inputs.
 *   3. On server state update:
 *      a. Find the server-acknowledged sequence number (ackSeq).
 *      b. Snap the local snake to the authoritative server position.
 *      c. Replay all unacknowledged inputs on top of that position.
 *   4. This corrects accumulated error without visible rubber-banding.
 *
 * The prediction physics MUST mirror the C++ snake.cpp exactly.
 */
export class PredictionEngine {
  private state:        PredictedSnakeState | null = null;
  private inputHistory: InputSnapshot[] = new Array(INPUT_HISTORY_SIZE);
  private historyHead:  number = 0;
  private historyCount: number = 0;

  // ───────────────────────────────────────────────────────────────────────────
  // Initialization
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Initialize prediction state from the first server snapshot for this player.
   */
  public initState(
    id:       string,
    segments: [number, number][],
    mass:     number,
  ): void {
    const segs = segments.map(([x, y]) => ({ x, y }));
    const head = segs[0] || { x: 2000, y: 2000 };
    const next = segs[1] || head;
    const angle = Math.atan2(head.y - next.y, head.x - next.x);

    this.state = { id, angle, mass, isBoosting: false, segments: segs, pendingFood: 0 };
    this.historyHead  = 0;
    this.historyCount = 0;
  }

  public isInitialized(): boolean { return this.state !== null; }
  public getState():      PredictedSnakeState | null { return this.state; }

  // ───────────────────────────────────────────────────────────────────────────
  // Per-frame Prediction
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Apply an input snapshot to the local predicted state.
   * Called every render frame (60 fps).
   * Also stores the input in the history ring buffer.
   *
   * @returns Food spawn position if boost triggered food this frame, else null.
   */
  public applyInput(input: InputSnapshot, dt: number): { x: number; y: number } | null {
    if (!this.state) return null;

    // Store in ring buffer for future reconciliation replay
    this.inputHistory[this.historyHead] = input;
    this.historyHead = (this.historyHead + 1) % INPUT_HISTORY_SIZE;
    if (this.historyCount < INPUT_HISTORY_SIZE) this.historyCount++;

    return this.stepPhysics(this.state, input, dt);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Server Reconciliation
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Reconcile with an authoritative server snapshot.
   *
   * Steps:
   *   1. Snap local state to the server-authoritative position.
   *   2. Discard inputs older than ackSeq from the ring buffer.
   *   3. Replay all inputs newer than ackSeq to re-derive the current frame.
   *
   * @param ackSeq    The last input sequence number the server processed.
   * @param segments  Authoritative segment positions at the time of ackSeq.
   * @param mass      Authoritative mass at time of ackSeq.
   * @param isBoosting Authoritative boost state.
   */
  public reconcile(
    ackSeq:     number,
    segments:   [number, number][],
    mass:       number,
    isBoosting: boolean,
  ): void {
    if (!this.state) return;

    // 1. Snap to authoritative state
    this.state.segments   = segments.map(([x, y]) => ({ x, y }));
    this.state.mass       = mass;
    this.state.isBoosting = isBoosting;

    // Re-derive heading angle from authoritative segments
    if (segments.length >= 2) {
      const [hx, hy] = segments[0];
      const [nx, ny] = segments[1];
      this.state.angle = Math.atan2(hy - ny, hx - nx);
    }

    // 2. Find inputs in history that are newer than ackSeq, replay them
    const toReplay: InputSnapshot[] = [];
    for (let i = 0; i < this.historyCount; i++) {
      const idx = (this.historyHead - 1 - i + INPUT_HISTORY_SIZE) % INPUT_HISTORY_SIZE;
      const input = this.inputHistory[idx];
      if (!input) continue;

      // Check if this input is newer than ackSeq (handle wrap-around)
      if (this.isSeqNewer(input.seq, ackSeq)) {
        toReplay.unshift(input); // preserve chronological order
      }
    }

    // 3. Replay unacknowledged inputs at the fixed tick dt (1/30s)
    const replayDt = 1 / 30;
    for (const input of toReplay) {
      this.stepPhysics(this.state, input, replayDt);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Physics Simulation (must mirror snake.cpp exactly)
  // ───────────────────────────────────────────────────────────────────────────

  private stepPhysics(
    s:     PredictedSnakeState,
    input: InputSnapshot,
    dt:    number,
  ): { x: number; y: number } | null {
    let foodSpawn: { x: number; y: number } | null = null;

    // ── Boost mass consumption (mirrors snake.cpp) ──────────────────────────
    if (input.boost && s.mass > SNAKE_MIN_BOOST_MASS) {
      s.isBoosting = true;
      const massLost = SNAKE_BOOST_MASS_LOSS * dt;
      s.mass = Math.max(SNAKE_MIN_BOOST_MASS, s.mass - massLost);
      s.pendingFood += massLost;
    } else {
      s.isBoosting = false;
    }

    // ── Turn physics (mirrors snake.cpp) ────────────────────────────────────
    const turnFactor = 1.0 / (1.0 + Math.sqrt(s.mass) * 0.04);
    const turnMultiplier = s.isBoosting ? 1.4 : 1.0;
    const maxTurn    = SNAKE_BASE_TURN_SPEED * turnFactor * turnMultiplier * dt;
    let angleDiff    = input.angle - s.angle;

    // Normalize to [-PI, PI]
    angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));

    if (Math.abs(angleDiff) > maxTurn) {
      s.angle += Math.sign(angleDiff) * maxTurn;
    } else {
      s.angle = input.angle;
    }

    // ── Movement ─────────────────────────────────────────────────────────────
    const speedFactor = Math.max(0.65, 1.0 - Math.sqrt(s.mass) * 0.006);
    const speed = SNAKE_BASE_SPEED * (s.isBoosting ? SNAKE_BOOST_MULTIPLIER : 1.0) * speedFactor;

    if (s.segments.length === 0) return null;
    const head = s.segments[0];
    head.x += Math.cos(s.angle) * speed * dt;
    head.y += Math.sin(s.angle) * speed * dt;

    // ── Inverse kinematics: pull body segments toward head ───────────────────
    const radius  = SNAKE_BASE_RADIUS + Math.sqrt(s.mass) * SNAKE_RADIUS_FACTOR;
    const spacing = radius * 0.45;

    for (let i = 1; i < s.segments.length; i++) {
      const prev = s.segments[i - 1];
      const curr = s.segments[i];
      const dx = prev.x - curr.x;
      const dy = prev.y - curr.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > spacing) {
        const a = Math.atan2(dy, dx);
        curr.x = prev.x - Math.cos(a) * spacing;
        curr.y = prev.y - Math.sin(a) * spacing;
      }
    }

    // ── Segment count management (mirrors snake.cpp) ─────────────────────────
    const targetLength = SNAKE_BASE_LENGTH + Math.floor(s.mass / SNAKE_MASS_PER_SEGMENT);
    while (s.segments.length < targetLength) {
      const tail = s.segments[s.segments.length - 1];
      s.segments.push({ x: tail.x, y: tail.y });
    }
    while (s.segments.length > targetLength && s.segments.length > SNAKE_BASE_LENGTH) {
      s.segments.pop();
    }

    // ── Boost food spawn ──────────────────────────────────────────────────────
    if (s.pendingFood >= 1.5) {
      const tail = s.segments[s.segments.length - 1];
      foodSpawn = { x: tail.x, y: tail.y };
      s.pendingFood -= Math.floor(s.pendingFood);
    }

    return foodSpawn;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Utilities
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Returns true if seq `a` is "newer" than seq `b`, accounting for u16 wrap-around.
   */
  private isSeqNewer(a: number, b: number): boolean {
    const half = INPUT_SEQ_MAX / 2;
    return ((a - b + INPUT_SEQ_MAX) % INPUT_SEQ_MAX) < half && a !== b;
  }
}
