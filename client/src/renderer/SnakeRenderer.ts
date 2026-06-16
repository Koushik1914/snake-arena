import { Container, Sprite, Texture, Text, TextStyle, Graphics, BLEND_MODES } from 'pixi.js';
import { ObjectPool } from '../core/ObjectPool';

interface Segment { x: number; y: number; }

interface SnakeEntry {
  id:             string;
  bodySprites:    Sprite[];
  glowSprites:    Sprite[]; // pooled additive glow sprites for body segments
  leftEye:        Container;
  rightEye:       Container;
  leftPupil:      Graphics;
  rightPupil:     Graphics;
  nameLabel:      Text;
  container:      Container;
  visualSegments: Segment[]; // visually-smoothed positions
  boostGlow:      number;    // range [0.0, 1.0] for smooth glow fading
  headGlow:       Sprite;    // soft glowing aura around the head
}

/**
 * SnakeRenderer — Manages all snake visual representations in a single,
 * pooled system.
 *
 * Upgrades:
 *   - Visual position smoothing (lerping) to eliminate micro-jitter and reconciliation snaps.
 *   - Premium high-res 128x128 3D textures with specular highlights and rim shading.
 *   - Animated rainbow and striped skins.
 *   - Real-time smooth boost glow effects (additive blend modes) for head and body.
 *   - Zero garbage collection overhead during gameplay.
 */
export class SnakeRenderer {
  private worldContainer: Container;
  private entries: Map<string, SnakeEntry> = new Map();
  private spritePool: ObjectPool<Sprite>;

  private static glossyCache = new Map<string, Texture>();
  private static glowCache = new Map<string, Texture>();

  // Snake radius formula constants (must match shared constants)
  private static readonly BASE_RADIUS    = 8.0;
  private static readonly RADIUS_FACTOR  = 0.55;

  constructor(worldContainer: Container) {
    this.worldContainer = worldContainer;

    const baseTex = this.buildBaseGlossyTexture('#ffffff');

    this.spritePool = new ObjectPool<Sprite>(
      () => {
        const s = new Sprite(baseTex);
        s.anchor.set(0.5);
        return s;
      },
      (s) => {
        s.visible = false;
        s.tint = 0xffffff;
        s.scale.set(1);
        s.alpha = 1.0;
        s.blendMode = BLEND_MODES.NORMAL;
      },
      800,
      3000,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Per-Frame Update
  // ─────────────────────────────────────────────────────────────────────────

  public update(
    id:         string,
    name:       string,
    segments:   Segment[],
    mass:       number,
    color:      string,
    isBoosting: boolean,
    dt:         number,
  ): void {
    let entry = this.entries.get(id);
    if (!entry) {
      entry = this.createEntry(id, name);
      this.entries.set(id, entry);
    }

    if (segments.length === 0) return;

    // ── 1. Visual Position Lerping ───────────────────────────────────────────
    // Initialize visual segments if empty
    if (entry.visualSegments.length === 0) {
      entry.visualSegments = segments.map(s => ({ x: s.x, y: s.y }));
    }

    const lerpFactor = 1 - Math.exp(-22 * dt); // fast, smooth, responsive lerp

    // Match count
    if (entry.visualSegments.length > segments.length) {
      entry.visualSegments.length = segments.length;
    }

    for (let i = 0; i < segments.length; i++) {
      if (i >= entry.visualSegments.length) {
        entry.visualSegments.push({ x: segments[i].x, y: segments[i].y });
      } else {
        entry.visualSegments[i].x += (segments[i].x - entry.visualSegments[i].x) * lerpFactor;
        entry.visualSegments[i].y += (segments[i].y - entry.visualSegments[i].y) * lerpFactor;
      }
    }

    const radius = SnakeRenderer.BASE_RADIUS + Math.sqrt(mass) * SnakeRenderer.RADIUS_FACTOR;
    const skinType = this.getSkinType(id, name);
    const secondaryColor = this.getSecondaryColor(color);

    // ── 2. Boost Glow Animation ──────────────────────────────────────────────
    const targetGlow = isBoosting ? 1.0 : 0.05; // subtle idle glow
    const glowRate = isBoosting ? 10.0 : 4.0;    // faster fade in, slower fade out
    entry.boostGlow += (targetGlow - entry.boostGlow) * Math.min(1.0, glowRate * dt);

    // Update head glow position/scale/opacity
    entry.headGlow.texture = this.getGlowTexture(color);
    entry.headGlow.x = entry.visualSegments[0].x;
    entry.headGlow.y = entry.visualSegments[0].y;
    entry.headGlow.scale.set((radius * 3.5) / 64);
    entry.headGlow.alpha = entry.boostGlow * 0.7;
    entry.headGlow.visible = entry.boostGlow > 0.01;

    // ── 3. Acquire/Release Sprites ──────────────────────────────────────────
    const numNeeded = entry.visualSegments.length;

    // Body segments
    while (entry.bodySprites.length < numNeeded) {
      const s = this.spritePool.acquire();
      s.visible  = true;
      s.zIndex   = 3; // above glows
      entry.container.addChild(s);
      entry.bodySprites.push(s);
    }
    while (entry.bodySprites.length > numNeeded) {
      const s = entry.bodySprites.pop()!;
      entry.container.removeChild(s);
      this.spritePool.release(s);
    }

    // Body glows (one glow for every 2nd segment)
    const glowNeeded = Math.ceil(numNeeded / 2);
    while (entry.glowSprites.length < glowNeeded) {
      const s = this.spritePool.acquire();
      s.visible = true;
      s.zIndex = 1; // underneath body
      s.blendMode = BLEND_MODES.ADD;
      entry.container.addChild(s);
      entry.glowSprites.push(s);
    }
    while (entry.glowSprites.length > glowNeeded) {
      const s = entry.glowSprites.pop()!;
      entry.container.removeChild(s);
      this.spritePool.release(s);
    }

    // ── 4. Render Body & Glows ───────────────────────────────────────────────
    // Position and style each segment
    for (let i = 0; i < numNeeded; i++) {
      const seg    = entry.visualSegments[i];
      const sprite = entry.bodySprites[i];
      const taper  = 1 - (i / numNeeded) * 0.45;
      const scale  = (radius * 2.0 * taper) / 64; // overlapping segments (0.45 spacing)

      // Determine segment color based on skin
      let segColor = color;
      if (skinType === 'stripe') {
        segColor = (i % 2 === 0) ? color : secondaryColor;
      } else if (skinType === 'rainbow') {
        const colorsList = ['#00f0ff', '#ff007f', '#39ff14', '#ffbf00', '#bd00ff', '#00ffcc', '#ff3300', '#ffff00'];
        const timeOffset = Math.floor(Date.now() * 0.005);
        segColor = colorsList[(i + timeOffset) % colorsList.length];
      }

      // Slithering wobble wave (0 at head, maximum towards tail)
      let wobbleX = 0;
      let wobbleY = 0;
      if (i > 0 && numNeeded >= 2) {
        const nextSeg = entry.visualSegments[Math.max(0, i - 1)];
        const prevSeg = entry.visualSegments[Math.min(numNeeded - 1, i + 1)];
        const dx = nextSeg.x - prevSeg.x;
        const dy = nextSeg.y - prevSeg.y;
        const segmentAngle = Math.atan2(dy, dx);
        const perpAngle = segmentAngle + Math.PI / 2;
        
        const freq = isBoosting ? 0.022 : 0.012;
        const wave = Math.sin(Date.now() * freq - i * 0.25) * (radius * 0.12 * Math.min(1.0, i * 0.1));
        
        wobbleX = Math.cos(perpAngle) * wave;
        wobbleY = Math.sin(perpAngle) * wave;
      }

      sprite.texture = this.getGlossyTexture(segColor);
      sprite.position.set(seg.x + wobbleX, seg.y + wobbleY);
      sprite.scale.set(scale);
      sprite.visible = true;

      // Boost flash: alternate segments gain a soft tinted highlight
      sprite.tint = (isBoosting && i % 2 === 0) ? 0xffe6f2 : 0xffffff;
    }

    // Position and style body glows
    for (let g = 0; g < glowNeeded; g++) {
      const i = g * 2;
      const seg = entry.visualSegments[i];
      const sprite = entry.glowSprites[g];
      const taper = 1 - (i / numNeeded) * 0.45;
      const scale = (radius * 3.5 * taper) / 64;

      let segColor = color;
      if (skinType === 'stripe') {
        segColor = (i % 2 === 0) ? color : secondaryColor;
      } else if (skinType === 'rainbow') {
        const colorsList = ['#00f0ff', '#ff007f', '#39ff14', '#ffbf00', '#bd00ff', '#00ffcc', '#ff3300', '#ffff00'];
        const timeOffset = Math.floor(Date.now() * 0.005);
        segColor = colorsList[(i + timeOffset) % colorsList.length];
      }

      // Apply same wobble offsets to body glows
      let wobbleX = 0;
      let wobbleY = 0;
      if (i > 0 && numNeeded >= 2) {
        const nextSeg = entry.visualSegments[Math.max(0, i - 1)];
        const prevSeg = entry.visualSegments[Math.min(numNeeded - 1, i + 1)];
        const dx = nextSeg.x - prevSeg.x;
        const dy = nextSeg.y - prevSeg.y;
        const segmentAngle = Math.atan2(dy, dx);
        const perpAngle = segmentAngle + Math.PI / 2;
        
        const freq = isBoosting ? 0.022 : 0.012;
        const wave = Math.sin(Date.now() * freq - i * 0.25) * (radius * 0.12 * Math.min(1.0, i * 0.1));
        
        wobbleX = Math.cos(perpAngle) * wave;
        wobbleY = Math.sin(perpAngle) * wave;
      }

      sprite.texture = this.getGlowTexture(segColor);
      sprite.position.set(seg.x + wobbleX, seg.y + wobbleY);
      sprite.scale.set(scale);
      sprite.tint = 0xffffff;
      sprite.alpha = entry.boostGlow * 0.32;
      sprite.visible = entry.boostGlow > 0.01;
    }

    // ── 5. Eyes and Name Tag (uses visually smoothed positions) ──────────────
    if (numNeeded >= 2) {
      const head  = entry.visualSegments[0];
      const next  = entry.visualSegments[1];
      const angle = Math.atan2(head.y - next.y, head.x - next.x);
      const ed    = radius * 0.5;
      const eo    = 0.55;
      const eyeScale = radius / 20;

      entry.leftEye.visible = true;
      entry.leftEye.x       = head.x + Math.cos(angle - eo) * ed;
      entry.leftEye.y       = head.y + Math.sin(angle - eo) * ed;
      entry.leftEye.scale.set(eyeScale);

      entry.rightEye.visible = true;
      entry.rightEye.x       = head.x + Math.cos(angle + eo) * ed;
      entry.rightEye.y       = head.y + Math.sin(angle + eo) * ed;
      entry.rightEye.scale.set(eyeScale);

      const po = 1.3;
      entry.leftPupil.x  = Math.cos(angle) * po;
      entry.leftPupil.y  = Math.sin(angle) * po;
      entry.rightPupil.x = Math.cos(angle) * po;
      entry.rightPupil.y = Math.sin(angle) * po;

      entry.nameLabel.visible = true;
      entry.nameLabel.x       = head.x;
      entry.nameLabel.y       = head.y - radius - 14;
    } else {
      entry.leftEye.visible   = false;
      entry.rightEye.visible  = false;
      entry.nameLabel.visible = false;
    }
  }

  public removeSnake(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;

    for (const s of entry.bodySprites) {
      entry.container.removeChild(s);
      this.spritePool.release(s);
    }
    for (const s of entry.glowSprites) {
      entry.container.removeChild(s);
      this.spritePool.release(s);
    }
    entry.container.destroy({ children: true });
    this.entries.delete(id);
  }

  public removeStaleSnakes(activeIds: Set<string>): void {
    for (const id of this.entries.keys()) {
      if (!activeIds.has(id)) this.removeSnake(id);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Entry Construction
  // ─────────────────────────────────────────────────────────────────────────

  private createEntry(id: string, name: string): SnakeEntry {
    const container = new Container();
    container.zIndex = 2;
    container.sortableChildren = true;
    this.worldContainer.addChild(container);

    // Eyes
    const { eyeContainer: leftEye,  pupil: leftPupil  } = this.buildEye();
    const { eyeContainer: rightEye, pupil: rightPupil } = this.buildEye();
    leftEye.zIndex  = 5;
    rightEye.zIndex = 5;
    container.addChild(leftEye, rightEye);

    // Name label
    const nameLabel = new Text(name.substring(0, 12), new TextStyle({
      fontFamily:      'Outfit, sans-serif',
      fontSize:        13,
      fontWeight:      '600',
      fill:            '#ffffff',
      stroke:          '#06030c',
      strokeThickness: 3,
      align:           'center',
    }));
    nameLabel.anchor.set(0.5, 1);
    nameLabel.zIndex = 6;
    container.addChild(nameLabel);

    // Head Glow
    const headGlowTex = this.getGlowTexture('#ffffff');
    const headGlow = new Sprite(headGlowTex);
    headGlow.anchor.set(0.5);
    headGlow.zIndex = 1;
    headGlow.blendMode = BLEND_MODES.ADD;
    headGlow.visible = false;
    container.addChild(headGlow);

    return {
      id,
      bodySprites: [],
      glowSprites: [],
      leftEye,
      rightEye,
      leftPupil,
      rightPupil,
      nameLabel,
      container,
      visualSegments: [],
      boostGlow: 0.0,
      headGlow
    };
  }

  private buildEye(): { eyeContainer: Container; pupil: Graphics } {
    const eyeContainer = new Container();

    const sclera = new Graphics();
    sclera.beginFill(0xffffff);
    sclera.lineStyle(1, 0x120b22, 0.4);
    sclera.drawCircle(0, 0, 5);
    sclera.endFill();
    eyeContainer.addChild(sclera);

    const pupil = new Graphics();
    pupil.beginFill(0x0a0518);
    pupil.drawCircle(0, 0, 2.2);
    pupil.endFill();
    eyeContainer.addChild(pupil);

    return { eyeContainer, pupil };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Texture Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private getGlossyTexture(color: string): Texture {
    if (SnakeRenderer.glossyCache.has(color)) {
      return SnakeRenderer.glossyCache.get(color)!;
    }
    const tex = this.buildBaseGlossyTexture(color);
    SnakeRenderer.glossyCache.set(color, tex);
    return tex;
  }

  private buildBaseGlossyTexture(color: string): Texture {
    const canvas = document.createElement('canvas');
    canvas.width  = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // 3D sphere gradient shading
    const grad = ctx.createRadialGradient(45, 45, 4, 64, 64, 55);
    grad.addColorStop(0.0,  '#ffffff'); // Shiny specular highlight
    grad.addColorStop(0.2,  color);     // Neon base color
    grad.addColorStop(0.75, this.darken(color, 0.5)); // Diffuse shadow side
    grad.addColorStop(0.95, this.darken(color, 0.8)); // Rim shadow
    grad.addColorStop(1.0,  'rgba(0,0,0,0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(64, 64, 55, 0, Math.PI * 2);
    ctx.fill();

    // Specular highlight dot (adds depth)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    ctx.arc(42, 42, 6, 0, Math.PI * 2);
    ctx.fill();

    return Texture.from(canvas);
  }

  private getGlowTexture(color: string): Texture {
    if (SnakeRenderer.glowCache.has(color)) {
      return SnakeRenderer.glowCache.get(color)!;
    }
    const tex = this.buildBaseGlowTexture(color);
    SnakeRenderer.glowCache.set(color, tex);
    return tex;
  }

  private buildBaseGlowTexture(color: string): Texture {
    const SIZE = 128;
    const canvas = document.createElement('canvas');
    canvas.width  = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createRadialGradient(SIZE/2, SIZE/2, 0, SIZE/2, SIZE/2, SIZE/2);
    grad.addColorStop(0.0,  '#ffffff');
    grad.addColorStop(0.2,  color);
    grad.addColorStop(0.65, this.darken(color, 0.4));
    grad.addColorStop(1.0,  'rgba(0,0,0,0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE, SIZE);

    return Texture.from(canvas);
  }

  private getSkinType(id: string, name: string): 'neon' | 'stripe' | 'rainbow' {
    let hash = 0;
    const key = name + id;
    for (let i = 0; i < key.length; i++) {
      hash = key.charCodeAt(i) + ((hash << 5) - hash);
    }
    const val = Math.abs(hash) % 3;
    if (val === 0) return 'neon';
    if (val === 1) return 'stripe';
    return 'rainbow';
  }

  private getSecondaryColor(color: string): string {
    switch (color.toLowerCase()) {
      case '#00f0ff': return '#ff007f'; // cyan -> pink
      case '#ff007f': return '#00f0ff'; // pink -> cyan
      case '#39ff14': return '#bd00ff'; // green -> purple
      case '#bd00ff': return '#39ff14'; // purple -> green
      case '#ffbf00': return '#00ffcc'; // amber -> teal
      case '#00ffcc': return '#ffbf00'; // teal -> amber
      case '#ff3300': return '#ffff00'; // red-orange -> yellow
      case '#ffff00': return '#ff3300'; // yellow -> red-orange
      default: return '#ffffff';
    }
  }

  private darken(hex: string, pct: number): string {
    const n   = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * pct * 100);
    const R   = Math.max(0, (n >> 16) - amt);
    const G   = Math.max(0, ((n >> 8) & 0xff) - amt);
    const B   = Math.max(0, (n & 0xff) - amt);
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
  }

  public destroy(): void {
    for (const id of this.entries.keys()) this.removeSnake(id);
    this.spritePool.releaseAll();
  }
}
