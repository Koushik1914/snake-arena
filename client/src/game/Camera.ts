import { Container } from 'pixi.js';

/**
 * Camera — Smooth world-to-screen viewport transform.
 *
 * Features:
 *   - Frame-rate independent lerp (uses actual dt)
 *   - Dynamic zoom based on snake mass
 *   - Screen-shake for death feedback
 *   - screenToWorld coordinate mapping
 */
export class Camera {
  public x:    number = 2000;
  public y:    number = 2000;
  public zoom: number = 1.0;

  private targetX:    number = 2000;
  private targetY:    number = 2000;
  private targetZoom: number = 1.0;

  // Screen-shake state
  private shakeIntensity: number = 0;
  private shakeDuration:  number = 0;
  private shakeTimer:     number = 0;

  // Tuning
  private static readonly LERP_POSITION = 5.0;  // units per second (smooth follow)
  private static readonly LERP_ZOOM     = 2.0;  // zoom speed
  private static readonly BASE_ZOOM     = 1.0;
  private static readonly MIN_ZOOM      = 0.35;
  private static readonly INITIAL_MASS  = 50;

  public setTarget(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
  }

  public setMass(mass: number): void {
    const massScale    = mass / Camera.INITIAL_MASS;
    const computedZoom = Camera.BASE_ZOOM * Math.pow(massScale, -0.22);
    this.targetZoom    = Math.max(Camera.MIN_ZOOM, computedZoom);
  }

  /**
   * Trigger a screen-shake effect (e.g. on death explosion).
   * @param intensity  Max pixel displacement
   * @param duration   Seconds to shake for
   */
  public shake(intensity: number, duration: number): void {
    this.shakeIntensity = intensity;
    this.shakeDuration  = duration;
    this.shakeTimer     = duration;
  }

  public reset(x: number, y: number): void {
    this.x         = x;
    this.y         = y;
    this.targetX   = x;
    this.targetY   = y;
    this.zoom      = 1.0;
    this.targetZoom = 1.0;
    this.shakeTimer = 0;
  }

  /**
   * Update the camera and apply the transform to the world container.
   * @param dt             Delta time in seconds (for frame-rate independence)
   * @param screenWidth    Viewport width
   * @param screenHeight   Viewport height
   * @param worldContainer The PixiJS container to transform
   */
  public update(
    dt:             number,
    screenWidth:    number,
    screenHeight:   number,
    worldContainer: Container,
  ): void {
    // Frame-rate independent lerp: approaches target regardless of FPS
    const posAlpha  = 1 - Math.exp(-Camera.LERP_POSITION * dt);
    const zoomAlpha = 1 - Math.exp(-Camera.LERP_ZOOM * dt);

    this.x    += (this.targetX    - this.x)    * posAlpha;
    this.y    += (this.targetY    - this.y)    * posAlpha;
    this.zoom += (this.targetZoom - this.zoom) * zoomAlpha;

    // Compute screen-shake offset
    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      const t = Math.max(0, this.shakeTimer / this.shakeDuration);
      const amp = this.shakeIntensity * t;
      shakeX = (Math.random() - 0.5) * amp * 2;
      shakeY = (Math.random() - 0.5) * amp * 2;
    }

    // Apply pivot → position → scale to world container
    worldContainer.pivot.x    = this.x;
    worldContainer.pivot.y    = this.y;
    worldContainer.position.x = screenWidth  / 2 + shakeX;
    worldContainer.position.y = screenHeight / 2 + shakeY;
    worldContainer.scale.x    = this.zoom;
    worldContainer.scale.y    = this.zoom;
  }

  /** Convert screen pixel coords to world coords. */
  public screenToWorld(
    sx: number, sy: number,
    screenWidth: number, screenHeight: number,
  ): { x: number; y: number } {
    return {
      x: (sx - screenWidth  / 2) / this.zoom + this.x,
      y: (sy - screenHeight / 2) / this.zoom + this.y,
    };
  }
}
