import { Container, Sprite, Texture, Text, TextStyle, Graphics } from 'pixi.js';

export class SnakeSprite {
  public id: string;
  public container: Container;
  
  private bodySprites: Sprite[] = [];
  
  // Cartoon eyes
  private leftEyeContainer: Container | null = null;
  private rightEyeContainer: Container | null = null;
  private leftPupil: Graphics | null = null;
  private rightPupil: Graphics | null = null;
  
  private nameText: Text | null = null;
  
  private static BASE_RADIUS = 15;
  private static RADIUS_FACTOR = 0.6;
  
  // Cache for glossy skins
  private static textureCache: Map<string, Texture> = new Map();

  constructor(id: string, name: string) {
    this.id = id;
    
    this.container = new Container();
    this.container.zIndex = 2; // Render snakes above grid/food

    this.initEyes();
    this.initNickname(name);
  }

  private static getGlossyTexture(color: string): Texture {
    if (this.textureCache.has(color)) {
      return this.textureCache.get(color)!;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    // Spherical radial gradient offset to the top-left for glossy 3D look
    const grad = ctx.createRadialGradient(22, 22, 2, 32, 32, 32);
    grad.addColorStop(0, '#ffffff'); // bright shine highlight
    grad.addColorStop(0.25, color);  // base color
    grad.addColorStop(0.82, this.darkenColor(color, 0.4)); // 3D shaded rim
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    const texture = Texture.from(canvas);
    this.textureCache.set(color, texture);
    return texture;
  }

  private static darkenColor(hex: string, percent: number): string {
    const cleanHex = hex.replace('#', '');
    const num = parseInt(cleanHex, 16);
    const amt = Math.round(2.55 * percent * 100);
    
    let R = (num >> 16) - amt;
    let G = (num >> 8 & 0x00FF) - amt;
    let B = (num & 0x0000FF) - amt;
    
    R = R < 0 ? 0 : R;
    G = G < 0 ? 0 : G;
    B = B < 0 ? 0 : B;
    
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
  }

  private initEyes() {
    // Left Eye
    this.leftEyeContainer = new Container();
    this.leftEyeContainer.zIndex = 5;

    const leftSclera = new Graphics();
    leftSclera.beginFill(0xffffff);
    leftSclera.lineStyle(1, 0x120b22, 0.4);
    leftSclera.drawCircle(0, 0, 5);
    leftSclera.endFill();
    this.leftEyeContainer.addChild(leftSclera);

    this.leftPupil = new Graphics();
    this.leftPupil.beginFill(0x0a0518);
    this.leftPupil.drawCircle(0, 0, 2.2);
    this.leftPupil.endFill();
    this.leftEyeContainer.addChild(this.leftPupil);

    // Right Eye
    this.rightEyeContainer = new Container();
    this.rightEyeContainer.zIndex = 5;

    const rightSclera = new Graphics();
    rightSclera.beginFill(0xffffff);
    rightSclera.lineStyle(1, 0x120b22, 0.4);
    rightSclera.drawCircle(0, 0, 5);
    rightSclera.endFill();
    this.rightEyeContainer.addChild(rightSclera);

    this.rightPupil = new Graphics();
    this.rightPupil.beginFill(0x0a0518);
    this.rightPupil.drawCircle(0, 0, 2.2);
    this.rightPupil.endFill();
    this.rightEyeContainer.addChild(this.rightPupil);

    this.container.addChild(this.leftEyeContainer);
    this.container.addChild(this.rightEyeContainer);
  }

  private initNickname(name: string) {
    const style = new TextStyle({
      fontFamily: 'Outfit',
      fontSize: 13,
      fontWeight: '600',
      fill: '#ffffff',
      stroke: '#06030c',
      strokeThickness: 3,
      align: 'center'
    });

    this.nameText = new Text(name, style);
    this.nameText.anchor.set(0.5, 1); // Anchor at bottom center
    this.nameText.zIndex = 6;
    this.container.addChild(this.nameText);
  }

  private getRadius(mass: number): number {
    return SnakeSprite.BASE_RADIUS + Math.sqrt(mass) * SnakeSprite.RADIUS_FACTOR;
  }

  public update(segments: { x: number; y: number }[], mass: number, color: string, isBoosting: boolean) {
    const radius = this.getRadius(mass);
    const glossyTexture = SnakeSprite.getGlossyTexture(color);

    // 1. Maintain body segment sprites list
    const numSegmentsNeeded = segments.length;
    
    // Add missing segment sprites
    while (this.bodySprites.length < numSegmentsNeeded) {
      const sprite = new Sprite(glossyTexture);
      sprite.anchor.set(0.5);
      sprite.zIndex = 1;
      this.container.addChild(sprite);
      this.bodySprites.push(sprite);
    }
    
    // Hide extra segment sprites
    for (let i = numSegmentsNeeded; i < this.bodySprites.length; i++) {
      this.bodySprites[i].visible = false;
    }

    // 2. Position and scale segment sprites
    for (let i = 0; i < numSegmentsNeeded; i++) {
      const seg = segments[i];
      const sprite = this.bodySprites[i];
      sprite.visible = true;
      sprite.texture = glossyTexture;
      sprite.position.set(seg.x, seg.y);

      // Scale segment size (sprites are 64x64, diameter is 64. Scale to match exact radius)
      const targetScale = (radius * 2) / 64;
      
      // Taper segments slightly towards the tail for organic/smooth anatomy
      const tailTaper = 1 - (i / numSegmentsNeeded) * 0.45;
      sprite.scale.set(targetScale * tailTaper);

      // Flashing boost overlay effect
      if (isBoosting && i % 2 === 0) {
        sprite.tint = 0xffe6f2; // Flash pinkish white on boost
      } else {
        sprite.tint = 0xffffff; // Natural glossy colors
      }
    }

    // Sort children based on zIndex
    this.container.sortChildren();

    // 3. Render Head Features (Cartoon Eyes and Nickname Label)
    if (numSegmentsNeeded >= 2 && this.leftEyeContainer && this.rightEyeContainer && this.leftPupil && this.rightPupil && this.nameText) {
      const head = segments[0];
      const next = segments[1];
      
      // Direction angle of the head
      const angle = Math.atan2(head.y - next.y, head.x - next.x);

      // Position eyes relative to head center and angle
      const eyeDistance = radius * 0.5;
      const eyeAngleOffset = 0.55; // Radians offset to left/right
      
      this.leftEyeContainer.visible = true;
      this.leftEyeContainer.x = head.x + Math.cos(angle - eyeAngleOffset) * eyeDistance;
      this.leftEyeContainer.y = head.y + Math.sin(angle - eyeAngleOffset) * eyeDistance;
      this.leftEyeContainer.scale.set(radius / 20); // Scale eyes with head size

      this.rightEyeContainer.visible = true;
      this.rightEyeContainer.x = head.x + Math.cos(angle + eyeAngleOffset) * eyeDistance;
      this.rightEyeContainer.y = head.y + Math.sin(angle + eyeAngleOffset) * eyeDistance;
      this.rightEyeContainer.scale.set(radius / 20);

      // Offset pupils inside the scleras to look forward in the heading direction
      const pupilOffset = 1.3;
      this.leftPupil.x = Math.cos(angle) * pupilOffset;
      this.leftPupil.y = Math.sin(angle) * pupilOffset;
      
      this.rightPupil.x = Math.cos(angle) * pupilOffset;
      this.rightPupil.y = Math.sin(angle) * pupilOffset;

      // Floating nickname label
      this.nameText.visible = true;
      this.nameText.x = head.x;
      this.nameText.y = head.y - radius - 12;
    } else {
      if (this.leftEyeContainer) this.leftEyeContainer.visible = false;
      if (this.rightEyeContainer) this.rightEyeContainer.visible = false;
      if (this.nameText) this.nameText.visible = false;
    }
  }

  public destroy() {
    this.container.destroy({ children: true });
    this.bodySprites = [];
    this.leftEyeContainer = null;
    this.rightEyeContainer = null;
    this.leftPupil = null;
    this.rightPupil = null;
    this.nameText = null;
  }
}
