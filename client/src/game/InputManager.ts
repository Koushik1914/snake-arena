import { INPUT_SEQ_MAX } from 'snake-arena-shared/constants';

/** A single captured input frame with its sequence number. */
export interface InputSnapshot {
  seq:       number;  // monotonically increasing, wraps at INPUT_SEQ_MAX
  angle:     number;  // radians [-PI, PI]
  boost:     boolean;
  timestamp: number;  // performance.now() when captured
}

/**
 * InputManager — Captures raw device input and stamps each frame with a
 * monotonically increasing sequence number for server reconciliation.
 *
 * Input sources:
 *   - Mouse position (primary control)
 *   - Left mouse button / spacebar (boost)
 */
export class InputManager {
  private targetAngle:  number  = 0;
  private boostActive:  boolean = false;
  private sequenceNum:  number  = 0;

  private targetElement: HTMLElement;

  // Pre-bound handlers for clean removeEventListener
  private readonly onMouseMove:   (e: MouseEvent)    => void;
  private readonly onMouseDown:   (e: MouseEvent)    => void;
  private readonly onMouseUp:     (e: MouseEvent)    => void;
  private readonly onKeyDown:     (e: KeyboardEvent) => void;
  private readonly onKeyUp:       (e: KeyboardEvent) => void;
  private readonly onContextMenu: (e: Event)         => void;

  constructor(targetElement: HTMLElement) {
    this.targetElement = targetElement;

    this.onMouseMove   = this.handleMouseMove.bind(this);
    this.onMouseDown   = this.handleMouseDown.bind(this);
    this.onMouseUp     = this.handleMouseUp.bind(this);
    this.onKeyDown     = this.handleKeyDown.bind(this);
    this.onKeyUp       = this.handleKeyUp.bind(this);
    this.onContextMenu = (e) => e.preventDefault();

    this.registerListeners();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Event Handlers
  // ───────────────────────────────────────────────────────────────────────────

  private handleMouseMove(e: MouseEvent): void {
    const rect    = this.targetElement.getBoundingClientRect();
    const centerX = rect.left + rect.width  / 2;
    const centerY = rect.top  + rect.height / 2;
    this.targetAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
  }

  private handleMouseDown(e: MouseEvent): void {
    if (e.button === 0) this.boostActive = true;
  }

  private handleMouseUp(e: MouseEvent): void {
    if (e.button === 0) this.boostActive = false;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Space') {
      this.boostActive = true;
      e.preventDefault();
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Space') {
      this.boostActive = false;
      e.preventDefault();
    }
  }

  private registerListeners(): void {
    window.addEventListener('mousemove',  this.onMouseMove);
    window.addEventListener('mousedown',  this.onMouseDown);
    window.addEventListener('mouseup',    this.onMouseUp);
    window.addEventListener('keydown',    this.onKeyDown);
    window.addEventListener('keyup',      this.onKeyUp);
    this.targetElement.addEventListener('contextmenu', this.onContextMenu);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Returns the next input snapshot with an incremented sequence number.
   * Call once per frame before sending to the server.
   */
  public sampleInput(): InputSnapshot {
    this.sequenceNum = (this.sequenceNum + 1) % INPUT_SEQ_MAX;
    return {
      seq:       this.sequenceNum,
      angle:     this.targetAngle,
      boost:     this.boostActive,
      timestamp: performance.now(),
    };
  }

  public getAngle():     number  { return this.targetAngle; }
  public isBoosting():   boolean { return this.boostActive; }
  public getLastSeq():   number  { return this.sequenceNum; }

  public destroy(): void {
    window.removeEventListener('mousemove',  this.onMouseMove);
    window.removeEventListener('mousedown',  this.onMouseDown);
    window.removeEventListener('mouseup',    this.onMouseUp);
    window.removeEventListener('keydown',    this.onKeyDown);
    window.removeEventListener('keyup',      this.onKeyUp);
    this.targetElement.removeEventListener('contextmenu', this.onContextMenu);
  }
}
