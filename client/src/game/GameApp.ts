import { Application, Container } from 'pixi.js';
import { Camera }          from './Camera';
import { InputManager }    from './InputManager';
import { PredictionEngine } from './PredictionEngine';
import { ArenaRenderer }   from '../renderer/ArenaRenderer';
import { SnakeRenderer }   from '../renderer/SnakeRenderer';
import { FoodRenderer }    from '../renderer/FoodRenderer';
import { ParticleSystem }  from '../renderer/ParticleSystem';
import { MinimapRenderer } from '../renderer/MinimapRenderer';
import { HudUI }           from '../ui/HudUI';
import type { NetworkClient, RemoteSnakeState } from '../network/NetworkClient';
import type { EventBus } from '../core/EventBus';

/**
 * GameApp — The main game orchestrator.
 *
 * Responsibilities:
 *   - Owns the PixiJS Application and main ticker (render loop)
 *   - Coordinates all subsystems each frame
 *   - Delegates rendering to specialized renderer classes
 *   - Delegates physics to PredictionEngine
 *   - Does NOT contain game logic or rendering code directly
 *
 * Frame flow each tick:
 *   1. Sample input → send to server → apply via PredictionEngine
 *   2. Interpolate remote snakes (NetworkClient)
 *   3. Reconcile local snake with server ACK (PredictionEngine)
 *   4. Process game events (explosions, food eaten)
 *   5. Update camera
 *   6. Render: arena → food → snakes → particles → minimap → HUD
 */
export class GameApp {
  private pixiApp:   Application;
  private world:     Container;
  private camera:    Camera;
  private input:     InputManager;
  private predict:   PredictionEngine;
  private network:   NetworkClient;

  // Renderers
  private arena:     ArenaRenderer;
  private snakeR:    SnakeRenderer;
  private foodR:     FoodRenderer;
  private particles: ParticleSystem;
  private minimap:   MinimapRenderer;
  private hud:       HudUI;

  private localOutsideTime = 0.0;

  // Event unsubscribers
  private unsubs: Array<() => void> = [];

  constructor(network: NetworkClient, bus: EventBus, hud: HudUI) {
    this.network = network;
    this.hud     = hud;

    // ── 1. PixiJS Application ──────────────────────────────────────────────
    this.pixiApp = new Application({
      resizeTo:        window,
      antialias:       true,
      backgroundColor: 0x06030c,
      resolution:      window.devicePixelRatio || 1,
      autoDensity:     true,
    });
    document.getElementById('game-container')!.appendChild(
      this.pixiApp.view as HTMLCanvasElement,
    );

    // ── 2. World container (all game objects live here; camera transforms it)
    this.world = new Container();
    this.world.sortableChildren = true;
    this.pixiApp.stage.addChild(this.world);

    // ── 3. Subsystems ─────────────────────────────────────────────────────
    this.camera  = new Camera();
    this.input   = new InputManager(this.pixiApp.view as HTMLCanvasElement);
    this.predict = new PredictionEngine();

    this.arena     = new ArenaRenderer(this.pixiApp, this.world);
    this.snakeR    = new SnakeRenderer(this.world);
    this.foodR     = new FoodRenderer(this.world);
    this.particles = new ParticleSystem(this.world);
    this.minimap   = new MinimapRenderer(network.mapSize);

    // ── 4. Event subscriptions ────────────────────────────────────────────
    this.unsubs.push(
      bus.on('gameState', (packet) => {
        // GameStatePacket is a tuple: [tick, ackSeq, players, foodAdded, foodRemoved, events]
        const [, ackSeq, players, , , events] = packet;

        // Reconcile local player prediction with server ACK
        const localData = players.find((p) => (p as unknown[])[0] === network.localPlayerId);
        if (localData) {
          const row = localData as unknown as [string,string,string,number,boolean,[number,number][],number];
          const mass = row[3]; const isBoosting = row[4]; const segments = row[5];
          this.predict.reconcile(ackSeq, segments, mass, isBoosting);
        }

        // Process tick events (explosions, etc.)
        for (const ev of events) {
          const row = ev as unknown[];
          if (row[0] === 'elimination') {
            const x = row[1] as number; const y = row[2] as number;
            const color = row[3] as string; const score = row[4] as number;
            const colorNum = parseInt(color.replace('#', ''), 16);
            const count    = Math.min(120, 20 + Math.floor(score * 0.15));
            this.particles.emitExplosion(x, y, colorNum, count, this.camera);
          }
        }
      }),
    );

    // ── 5. Start render ticker ────────────────────────────────────────────
    this.pixiApp.ticker.add(this.gameLoop.bind(this));

    window.addEventListener('resize', () => this.pixiApp.resize());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Main Game Loop (called at 60 FPS by PixiJS ticker)
  // ─────────────────────────────────────────────────────────────────────────

  private gameLoop(delta: number): void {
    const dt = delta / 60; // PixiJS delta is in frames at 60fps target

    this.hud.tickFps();

    // ── 1. Sample input, send to server, apply locally via prediction ─────
    if (this.network.isConnected()) {
      const input = this.input.sampleInput();
      this.network.sendInput(input);
      if (this.predict.isInitialized()) {
        this.predict.applyInput(input, dt);

        // Mirror predicted state back into network snakes for rendering
        const predicted = this.predict.getState();
        const localSnake = this.network.snakes.get(this.network.localPlayerId);
        if (predicted && localSnake) {
          localSnake.segments   = predicted.segments;
          localSnake.mass       = predicted.mass;
          localSnake.isBoosting = predicted.isBoosting;
        }
      }
    }

    // ── 2. Interpolate remote snakes ─────────────────────────────────────
    this.network.interpolateRemotePlayers();

    // ── 3. Update camera ─────────────────────────────────────────────────
    this.updateCamera(dt);

    // ── 4. Render all snakes ─────────────────────────────────────────────
    const activeIds = new Set<string>();
    for (const [id, snake] of this.network.snakes) {
      activeIds.add(id);
      this.snakeR.update(id, snake.name, snake.segments, snake.mass, snake.color, snake.isBoosting, dt);

      // Emit boost sparks from tail/body for ANY player currently boosting
      if (snake.isBoosting && snake.segments.length > 0) {
        const color = parseInt(snake.color.replace('#', ''), 16);
        const tail = snake.segments[snake.segments.length - 1];
        if (Math.random() < 0.3) {
          this.particles.emitBoostSpark(tail.x, tail.y, color);
        }
        if (Math.random() < 0.15) {
          const randSeg = snake.segments[Math.floor(Math.random() * snake.segments.length)];
          this.particles.emitBoostSpark(randSeg.x, randSeg.y, color);
        }
      }
    }
    this.snakeR.removeStaleSnakes(activeIds);

    // ── 5. Render food ────────────────────────────────────────────────────
    this.foodR.render(this.network.food);

    // ── 6. Update particles ───────────────────────────────────────────────
    this.particles.update(dt);

    // ── 7. Render minimap ─────────────────────────────────────────────────
    this.minimap.render(this.network.snakes, this.network.localPlayerId, this.network.mapSize);

    // ── 8. Update HUD stats & Boundary Warning ────────────────────────────
    const localSnake = this.network.snakes.get(this.network.localPlayerId);
    if (localSnake) {
      const lb   = this.network.leaderboard;
      const rank = lb.findIndex(([name]) => name === localSnake.name) + 1 || 1;
      this.hud.updatePlayerStats(Math.floor(localSnake.mass), rank, this.network.snakes.size);
      this.hud.updateLeaderboard(this.network.leaderboard as [string, number][], this.network.localPlayerName);

      // Boundary check and warning countdown + particle effects
      if (localSnake.segments.length > 0) {
        const head = localSnake.segments[0];
        const cx = this.network.mapSize / 2;
        const cy = this.network.mapSize / 2;
        const r = this.network.mapSize / 2;
        const dx = head.x - cx;
        const dy = head.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > r) {
          this.localOutsideTime += dt;
          const remaining = Math.max(0, 3.0 - this.localOutsideTime);
          this.hud.showBoundaryWarning(remaining);
        } else {
          this.localOutsideTime = 0.0;
          this.hud.hideBoundaryWarning();
        }

        // Spawn glowing border particles if close to the border
        if (dist > r - 800) {
          if (Math.random() < 0.35) {
            const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.0;
            const px = cx + Math.cos(angle) * r;
            const py = cy + Math.sin(angle) * r;
            this.particles.emitBoostSpark(px, py, 0xff0055); // deep pink border particle
          }
        }
      }
    } else {
      this.hud.hideBoundaryWarning();
      this.localOutsideTime = 0.0;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Camera Update
  // ─────────────────────────────────────────────────────────────────────────

  private updateCamera(dt: number): void {
    const screen = this.pixiApp.screen;
    let snake: RemoteSnakeState | undefined;

    // Follow local player
    snake = this.network.snakes.get(this.network.localPlayerId);

    if (!snake || snake.segments.length === 0) {
      // Spectate leader
      const lb = this.network.leaderboard;
      if (lb.length > 0) {
        const leaderName = lb[0][0];
        for (const s of this.network.snakes.values()) {
          if (s.name === leaderName && s.segments.length > 0) {
            snake = s;
            break;
          }
        }
      }
    }

    if (snake && snake.segments.length > 0) {
      const head = snake.segments[0];
      this.camera.setTarget(head.x, head.y);
      this.camera.setMass(snake.mass);
    } else {
      this.camera.setTarget(this.network.mapSize / 2, this.network.mapSize / 2);
    }

    this.camera.update(dt, screen.width, screen.height, this.world);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  public initLocalPlayer(segments: [number, number][], mass: number): void {
    this.predict.initState(this.network.localPlayerId, segments, mass);
    if (segments.length > 0) {
      this.camera.reset(segments[0][0], segments[0][1]);
    } else {
      this.camera.reset(this.network.mapSize / 2, this.network.mapSize / 2);
    }
  }

  public destroy(): void {
    this.unsubs.forEach(fn => fn());
    this.input.destroy();
    this.arena.destroy();
    this.snakeR.destroy();
    this.foodR.destroy();
    this.particles.destroy();
    this.pixiApp.destroy(true, { children: true, texture: true, baseTexture: true });
    window.removeEventListener('resize', () => this.pixiApp.resize());
  }
}
