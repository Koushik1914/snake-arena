import type { RemoteSnakeState } from '../network/NetworkClient';

/**
 * MinimapRenderer — Renders the circular minimap in the bottom-right corner.
 *
 * Uses the existing canvas-2D minimap element (appropriate for low-resolution HUD).
 * Renders:
 *   - Other player positions (white dots)
 *   - Local player position (pulsing cyan dot)
 *   - Faint food density hint (background dots)
 */
export class MinimapRenderer {
  private canvas:  HTMLCanvasElement;
  private ctx:     CanvasRenderingContext2D;
  private size:    number;
  private mapSize: number;

  private frameCount = 0;

  constructor(mapSize: number) {
    this.canvas  = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    this.ctx     = this.canvas.getContext('2d')!;
    this.size    = 146;  // Must match CSS/HTML canvas size
    this.mapSize = mapSize;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Frame Render
  // ─────────────────────────────────────────────────────────────────────────

  public render(
    snakes:        Map<string, RemoteSnakeState>,
    localPlayerId: string,
    mapSize:       number,
  ): void {
    // Throttle rendering to ~15 FPS to reduce drawing overhead
    this.frameCount++;
    if (this.frameCount % 4 !== 0) return;

    this.mapSize = mapSize;
    const { ctx, size } = this;
    const scale = size / this.mapSize;

    // Clear with semi-transparent fill to allow trails to fade gracefully
    ctx.clearRect(0, 0, size, size);

    // Clip to circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();

    // Dark base
    ctx.fillStyle = 'rgba(4, 2, 8, 0.5)';
    ctx.fillRect(0, 0, size, size);

    // Remote snakes — white dots
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    for (const [id, snake] of snakes) {
      if (id === localPlayerId || snake.segments.length === 0) continue;
      const head = snake.segments[0];
      ctx.beginPath();
      ctx.arc(head.x * scale, head.y * scale, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Local player — pulsing cyan dot
    const localSnake = snakes.get(localPlayerId);
    if (localSnake && localSnake.segments.length > 0) {
      const head   = localSnake.segments[0];
      const mx     = head.x * scale;
      const my     = head.y * scale;
      const pulse  = 3.5 + Math.sin(Date.now() * 0.007) * 1.5;

      // Outer pulse ring
      ctx.fillStyle = 'rgba(0, 240, 255, 0.22)';
      ctx.beginPath();
      ctx.arc(mx, my, pulse, 0, Math.PI * 2);
      ctx.fill();

      // Solid core
      ctx.fillStyle = '#00f0ff';
      ctx.beginPath();
      ctx.arc(mx, my, 3.0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Draw thin circular neon pink boundary outline at the outer edge
    ctx.strokeStyle = 'rgba(255, 0, 85, 0.85)';
    ctx.lineWidth   = 2.0;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
  }
}
