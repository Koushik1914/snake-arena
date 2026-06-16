import { Container, ParticleContainer, Sprite, Texture } from 'pixi.js';
import { ObjectPool } from '../core/ObjectPool';
import type { Camera } from '../game/Camera';

// ─────────────────────────────────────────────────────────────────────────────
// Particle State
// ─────────────────────────────────────────────────────────────────────────────

interface Particle {
  sprite:  Sprite;
  vx:      number;
  vy:      number;
  life:    number;   // remaining lifetime in seconds
  maxLife: number;   // total lifetime for alpha interpolation
}

/**
 * ParticleSystem — Pooled GPU particle system for boost trails and death explosions.
 *
 * Uses ParticleContainer for maximum throughput.
 * Pool pre-warmed with 1024 sprites; no GC allocations during gameplay.
 *
 * Usage:
 *   - particleSystem.emitBoostSpark(x, y, color)     — lightweight spark trail
 *   - particleSystem.emitExplosion(x, y, color, count) — death burst
 *   - particleSystem.update(dt)                       — called every frame
 */
export class ParticleSystem {
  private container:  ParticleContainer;
  private spritePool: ObjectPool<Sprite>;
  private active:     Particle[] = [];

  private static glowTexture: Texture | null = null;

  constructor(worldContainer: Container) {
    this.container = new ParticleContainer(1024, {
      position: true,
      scale:    true,
      alpha:    true,
      tint:     true,
    });
    this.container.zIndex = 10; // Above everything
    worldContainer.addChild(this.container);

    if (!ParticleSystem.glowTexture) {
      ParticleSystem.glowTexture = this.buildParticleTexture();
    }
    const tex = ParticleSystem.glowTexture;

    this.spritePool = new ObjectPool<Sprite>(
      () => {
        const s = new Sprite(tex);
        s.anchor.set(0.5);
        return s;
      },
      (s) => {
        s.visible = false;
        s.alpha   = 0;
        s.scale.set(1);
        s.tint    = 0xffffff;
        this.container.removeChild(s);
      },
      1024,
      1024,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Emitters
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Emit a single lightweight boost spark (called per-frame while boosting).
   */
  public emitBoostSpark(x: number, y: number, color: number): void {
    const angle = Math.random() * Math.PI * 2;
    const speed = 25 + Math.random() * 50;
    this.spawnParticle(
      x, y,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      2.5 + Math.random() * 2.5,
      0.4 + Math.random() * 0.3,
      color,
    );
  }

  /**
   * Emit a burst of explosion particles (on snake death).
   * @param count  Number of particles (scales with score).
   * @param camera Used for screen-shake trigger (optional).
   */
  public emitExplosion(
    x: number, y: number,
    color: number,
    count: number,
    camera?: Camera,
  ): void {
    camera?.shake(12, 0.35);

    const clampedCount = Math.min(120, count);
    for (let i = 0; i < clampedCount; i++) {
      const angle = (i / clampedCount) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 80 + Math.random() * 280;
      this.spawnParticle(
        x, y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        4 + Math.random() * 6,
        0.7 + Math.random() * 0.6,
        color,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Per-frame Update
  // ─────────────────────────────────────────────────────────────────────────

  public update(dt: number): void {
    const nextActive: Particle[] = [];

    for (const p of this.active) {
      p.life -= dt;
      if (p.life <= 0) {
        this.spritePool.release(p.sprite);
        continue;
      }

      // Move with friction
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      p.vx *= 0.93;
      p.vy *= 0.93;

      // Fade out
      p.sprite.alpha = Math.max(0, p.life / p.maxLife);

      nextActive.push(p);
    }

    this.active = nextActive;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private spawnParticle(
    x: number, y: number,
    vx: number, vy: number,
    size: number,
    life: number,
    color: number,
  ): void {
    const sprite = this.spritePool.acquire();
    sprite.position.set(x, y);
    sprite.scale.set(size / 32);
    sprite.alpha   = 1;
    sprite.tint    = color;
    sprite.visible = true;
    this.container.addChild(sprite);

    this.active.push({ sprite, vx, vy, life, maxLife: life });
  }

  private buildParticleTexture(): Texture {
    const SIZE   = 64;
    const canvas = document.createElement('canvas');
    canvas.width  = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createRadialGradient(SIZE/2, SIZE/2, 0, SIZE/2, SIZE/2, SIZE/2);
    grad.addColorStop(0.0,  'rgba(255,255,255,1.0)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.65)');
    grad.addColorStop(0.7,  'rgba(255,255,255,0.15)');
    grad.addColorStop(1.0,  'rgba(255,255,255,0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE, SIZE);

    return Texture.from(canvas);
  }

  public destroy(): void {
    this.spritePool.releaseAll();
    this.container.destroy({ children: true });
    this.active = [];
  }
}
