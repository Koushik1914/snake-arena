import { Application, Container, Graphics, Texture, TilingSprite } from 'pixi.js';
import { MAP_SIZE } from 'snake-arena-shared/constants';

/**
 * ArenaRenderer — Manages background, border, and vignette rendering.
 *
 * Extracted from GameApp to keep visual layers modular and independently testable.
 *
 * Renders:
 *   1. Hexagonal dark-blue tiling background (GPU texture)
 *   2. Neon pink glowing arena border
 */
export class ArenaRenderer {
  private borderGraphics: Graphics;
  private tilingSprite:   TilingSprite;
  private worldContainer: Container;

  constructor(app: Application, worldContainer: Container) {
    this.worldContainer = worldContainer;

    // 1. Hex background (pre-baked tile texture — only drawn once)
    this.tilingSprite = this.createHexBackground(app);
    this.tilingSprite.zIndex = -10;
    this.tilingSprite.position.set(-600, -600);
    this.tilingSprite.width = MAP_SIZE + 1200;
    this.tilingSprite.height = MAP_SIZE + 1200;
    this.worldContainer.addChild(this.tilingSprite);

    // 2. Arena border (redrawn on construction; static world position)
    this.borderGraphics = new Graphics();
    this.borderGraphics.zIndex = -1;
    this.worldContainer.addChild(this.borderGraphics);
    this.drawBorder();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Hexagonal Background Tile
  // ─────────────────────────────────────────────────────────────────────────

  private createHexBackground(_app: Application): TilingSprite {
    const R = 44;
    const W = R * Math.sqrt(3);
    const H = R * 1.5;

    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(W * 2);
    canvas.height = Math.round(H * 2);
    const ctx = canvas.getContext('2d')!;

    // Deep space dark base
    ctx.fillStyle = '#06030c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw hex borders with a subtle neon blue tint
    ctx.strokeStyle = 'rgba(0, 100, 180, 0.18)';
    ctx.lineWidth   = 1.2;

    const drawHex = (cx: number, cy: number, r: number) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 - Math.PI / 6;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    };

    // Tile centers for a hex grid offset pattern
    [[0, 0], [W * 2, 0], [W, H], [0, H * 2], [W * 2, H * 2]].forEach(([cx, cy]) => {
      drawHex(cx, cy, R);
    });

    // Subtle center glow dots
    ctx.fillStyle = 'rgba(0, 120, 200, 0.07)';
    [[0, 0], [W, H], [0, H * 2]].forEach(([cx, cy]) => {
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    const texture = Texture.from(canvas);
    return new TilingSprite(texture, MAP_SIZE + 400, MAP_SIZE + 400);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Arena Border
  // ─────────────────────────────────────────────────────────────────────────

  private drawBorder(): void {
    const g = this.borderGraphics;
    g.clear();

    const S = MAP_SIZE;
    const cx = S / 2;
    const cy = S / 2;
    const radius = S / 2;

    // Outer glow aura
    g.lineStyle({ width: 35, color: 0xff0055, alpha: 0.12 });
    g.drawCircle(cx, cy, radius + 10);

    // Mid glow
    g.lineStyle({ width: 15, color: 0xff0055, alpha: 0.28 });
    g.drawCircle(cx, cy, radius + 5);

    // Sharp neon edge
    g.lineStyle({ width: 6, color: 0xff0055, alpha: 1.0 });
    g.drawCircle(cx, cy, radius);
  }

  public destroy(): void {
    this.borderGraphics.destroy();
    this.tilingSprite.destroy();
  }
}
