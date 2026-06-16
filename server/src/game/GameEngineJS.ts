import { encode } from '@msgpack/msgpack';
import {
  MAP_SIZE,
  TARGET_FOOD_COUNT,
  SNAKE_BASE_SPEED,
  SNAKE_BOOST_MULTIPLIER,
  SNAKE_BASE_TURN_SPEED,
  SNAKE_BASE_RADIUS,
  SNAKE_RADIUS_FACTOR,
  SNAKE_BASE_LENGTH,
  SNAKE_MASS_PER_SEGMENT,
  SNAKE_MIN_BOOST_MASS,
  SNAKE_BOOST_MASS_LOSS,
  SNAKE_INITIAL_MASS,
} from '../../../shared/src/constants';

interface Segment {
  x: number;
  y: number;
}

export class SnakeJS {
  public id: string;
  public name: string;
  public color: string;
  public mass: number;
  public segments: Segment[];
  public angle: number;
  public targetAngle: number;
  public isBoosting: boolean;
  public pendingFoodSpawn: number;
  public outsideTime = 0.0; // tracks time spent outside circular boundary

  // Physics constants
  static BASE_SPEED = SNAKE_BASE_SPEED;
  static BOOST_MULTIPLIER = SNAKE_BOOST_MULTIPLIER;
  static BASE_TURN_SPEED = SNAKE_BASE_TURN_SPEED;
  static BASE_RADIUS = SNAKE_BASE_RADIUS;
  static RADIUS_FACTOR = SNAKE_RADIUS_FACTOR;
  static BASE_LENGTH = SNAKE_BASE_LENGTH;
  static MASS_PER_SEGMENT = SNAKE_MASS_PER_SEGMENT;
  static MIN_BOOST_MASS = SNAKE_MIN_BOOST_MASS;
  static BOOST_MASS_LOSS_RATE = SNAKE_BOOST_MASS_LOSS;

  constructor(id: string, name: string, x: number, y: number, color: string) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.mass = SNAKE_INITIAL_MASS;
    this.isBoosting = false;
    this.pendingFoodSpawn = 0.0;

    this.angle = Math.random() * 2.0 * Math.PI;
    this.targetAngle = this.angle;

    const spacing = this.getSegmentSpacing();
    this.segments = [];
    for (let i = 0; i < SnakeJS.BASE_LENGTH; i++) {
      this.segments.push({
        x: x - Math.cos(this.angle) * i * spacing,
        y: y - Math.sin(this.angle) * i * spacing
      });
    }
  }

  getRadius(): number {
    return SnakeJS.BASE_RADIUS + Math.sqrt(this.mass) * SnakeJS.RADIUS_FACTOR;
  }

  getSegmentSpacing(): number {
    return this.getRadius() * 0.5;
  }

  changeInput(newAngle: number, newIsBoosting: boolean) {
    this.targetAngle = newAngle;
    this.isBoosting = newIsBoosting;
  }

  grow(amount: number) {
    this.mass += amount;
  }

  update(dt: number, mapSize: number): { shouldSpawnFood: boolean; spawnX: number; spawnY: number; spawnMass: number; alive: boolean } {
    let shouldSpawnFood = false;
    let spawnX = 0;
    let spawnY = 0;
    let spawnMass = 0;

    // 1. Handle Speed Boost Mass Consumption
    if (this.isBoosting && this.mass > SnakeJS.MIN_BOOST_MASS) {
      const massLost = SnakeJS.BOOST_MASS_LOSS_RATE * dt;
      this.mass = Math.max(SnakeJS.MIN_BOOST_MASS, this.mass - massLost);
      this.pendingFoodSpawn += massLost;
    } else {
      this.isBoosting = false;
    }

    // 2. Turn physics (1.4x more responsive while boosting)
    const turnSpeedFactor = 1.0 / (1.0 + Math.sqrt(this.mass) * 0.04);
    const turnMultiplier = this.isBoosting ? 1.4 : 1.0;
    const maxTurn = SnakeJS.BASE_TURN_SPEED * turnSpeedFactor * turnMultiplier * dt;
    let angleDiff = this.targetAngle - this.angle;

    // Normalize angle difference to [-PI, PI]
    angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));

    if (Math.abs(angleDiff) > maxTurn) {
      this.angle += (angleDiff > 0.0 ? 1.0 : -1.0) * maxTurn;
    } else {
      this.angle = this.targetAngle;
    }

    // Normalize actual angle to [0, 2*PI]
    while (this.angle < 0.0) this.angle += 2.0 * Math.PI;
    while (this.angle >= 2.0 * Math.PI) this.angle -= 2.0 * Math.PI;

    // 3. Move the head
    const speedFactor = Math.max(0.65, 1.0 - Math.sqrt(this.mass) * 0.006);
    const currentSpeed = SnakeJS.BASE_SPEED * (this.isBoosting ? SnakeJS.BOOST_MULTIPLIER : 1.0) * speedFactor;

    const head = this.segments[0];
    const newHeadX = head.x + Math.cos(this.angle) * currentSpeed * dt;
    const newHeadY = head.y + Math.sin(this.angle) * currentSpeed * dt;

    // Check circular boundary collision (3 seconds grace period)
    const cx = mapSize / 2;
    const cy = mapSize / 2;
    const r = mapSize / 2;
    const dx = newHeadX - cx;
    const dy = newHeadY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > r) {
      this.outsideTime += dt;
      if (this.outsideTime >= 3.0) {
        return { shouldSpawnFood, spawnX, spawnY, spawnMass, alive: false };
      }
    } else {
      this.outsideTime = 0.0;
    }

    this.segments[0].x = newHeadX;
    this.segments[0].y = newHeadY;

    // 4. Update segments with distance constraints (Inverse Kinematics)
    const spacing = this.getSegmentSpacing();
    for (let i = 1; i < this.segments.length; ++i) {
      const prev = this.segments[i - 1];
      const curr = this.segments[i];
      const dx = prev.x - curr.x;
      const dy = prev.y - curr.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > spacing) {
        const segAngle = Math.atan2(dy, dx);
        this.segments[i].x = prev.x - Math.cos(segAngle) * spacing;
        this.segments[i].y = prev.y - Math.sin(segAngle) * spacing;
      }
    }

    // 5. Manage length
    const targetLength = SnakeJS.BASE_LENGTH + Math.floor(this.mass / SnakeJS.MASS_PER_SEGMENT);

    while (this.segments.length < targetLength) {
      const tail = this.segments[this.segments.length - 1];
      this.segments.push({ x: tail.x, y: tail.y });
    }

    while (this.segments.length > targetLength && this.segments.length > SnakeJS.BASE_LENGTH) {
      this.segments.pop();
    }

    // 6. Handle spawning of food from boost (smaller threshold for continuous trail)
    if (this.pendingFoodSpawn >= 1.5) {
      const tail = this.segments[this.segments.length - 1];
      spawnMass = Math.floor(this.pendingFoodSpawn);
      this.pendingFoodSpawn -= spawnMass;

      spawnX = tail.x;
      spawnY = tail.y;
      shouldSpawnFood = true;
    }

    return { shouldSpawnFood, spawnX, spawnY, spawnMass, alive: true };
  }
}

interface FoodItemJS {
  id: number;
  x: number;
  y: number;
  mass: number;
  color: string;
}

class FoodManagerJS {
  private nextId = 1;
  private mapSize: number;
  private cellSize = 200.0;
  private numCols: number;
  private numRows: number;
  private grid: Set<number>[][];

  public foodMap: Map<number, FoodItemJS> = new Map();

  static COLORS = [
    "#00f0ff", // cyan
    "#ff007f", // hot pink
    "#39ff14", // neon green
    "#ffbf00", // amber/orange
    "#bd00ff", // purple
    "#ffffff"  // white
  ];

  constructor(mapSize: number) {
    this.mapSize = mapSize;
    this.numCols = Math.ceil(mapSize / this.cellSize);
    this.numRows = Math.ceil(mapSize / this.cellSize);
    this.grid = [];
    for (let c = 0; c < this.numCols; c++) {
      this.grid[c] = [];
      for (let r = 0; r < this.numRows; r++) {
        this.grid[c][r] = new Set();
      }
    }
  }

  private getCellCoords(x: number, y: number): { col: number; row: number } {
    let col = Math.floor(Math.max(0.0, Math.min(this.mapSize - 1.0, x)) / this.cellSize);
    let row = Math.floor(Math.max(0.0, Math.min(this.mapSize - 1.0, y)) / this.cellSize);
    col = Math.max(0, Math.min(this.numCols - 1, col));
    row = Math.max(0, Math.min(this.numRows - 1, row));
    return { col, row };
  }

  addFood(x: number, y: number, mass = 1.0, color = "") {
    const id = this.nextId++;
    const finalColor = color || FoodManagerJS.COLORS[Math.floor(Math.random() * FoodManagerJS.COLORS.length)];

    const food = { id, x, y, mass, color: finalColor };
    this.foodMap.set(id, food);

    const { col, row } = this.getCellCoords(x, y);
    this.grid[col][row].add(id);
  }

  removeFood(id: number) {
    const food = this.foodMap.get(id);
    if (!food) return;

    const { col, row } = this.getCellCoords(food.x, food.y);
    this.grid[col][row].delete(id);
    this.foodMap.delete(id);
  }

  getRandomCircularCoords(): { x: number; y: number } {
    const r = Math.sqrt(Math.random()) * (this.mapSize / 2);
    const theta = Math.random() * 2 * Math.PI;
    const x = (this.mapSize / 2) + r * Math.cos(theta);
    const y = (this.mapSize / 2) + r * Math.sin(theta);
    return { x, y };
  }

  getRandomCircularCoordsWithDensityCheck(): { x: number; y: number } {
    let bestX = 0;
    let bestY = 0;
    let minDensity = Infinity;

    // Try 5 random candidate coordinates inside the circle, pick the one in the least populated cell
    for (let i = 0; i < 5; i++) {
      const candidate = this.getRandomCircularCoords();
      const { col, row } = this.getCellCoords(candidate.x, candidate.y);
      const density = this.grid[col][row].size;
      if (density < minDensity) {
        minDensity = density;
        bestX = candidate.x;
        bestY = candidate.y;
      }
    }
    return { x: bestX, y: bestY };
  }

  spawnInitialFood(targetCount: number) {
    for (let i = 0; i < targetCount; i++) {
      const { x, y } = this.getRandomCircularCoordsWithDensityCheck();
      
      // Small (80%): mass 1-2, Medium (15%): mass 4-6, Large (5%): mass 10-14
      const randVal = Math.random();
      let mass = 1.0;
      if (randVal < 0.80) {
        mass = 1.0 + Math.floor(Math.random() * 2.0); // 1 to 2
      } else if (randVal < 0.95) {
        mass = 4.0 + Math.floor(Math.random() * 3.0); // 4 to 6
      } else {
        mass = 10.0 + Math.floor(Math.random() * 5.0); // 10 to 14
      }
      this.addFood(x, y, mass);
    }
  }

  maintainDensity(targetCount: number) {
    const deficit = targetCount - this.foodMap.size;
    if (deficit > 0) {
      this.spawnInitialFood(deficit);
    }
  }

  updateFoodGridPosition(id: number, oldX: number, oldY: number, newX: number, newY: number) {
    const oldCoords = this.getCellCoords(oldX, oldY);
    const newCoords = this.getCellCoords(newX, newY);

    if (oldCoords.col !== newCoords.col || oldCoords.row !== newCoords.row) {
      this.grid[oldCoords.col][oldCoords.row].delete(id);
      this.grid[newCoords.col][newCoords.row].add(id);
    }
  }

  updateMagnetization(snakes: Map<string, SnakeJS>, dt: number) {
    if (snakes.size === 0) return;

    for (const food of this.foodMap.values()) {
      let minDistSq = 99999999.0;
      let nearestSnake: SnakeJS | null = null;

      for (const s of snakes.values()) {
        if (s.segments.length === 0) continue;

        const dx = s.segments[0].x - food.x;
        const dy = s.segments[0].y - food.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < minDistSq) {
          minDistSq = distSq;
          nearestSnake = s;
        }
      }

      if (nearestSnake) {
        const rHead = nearestSnake.getRadius();
        const magnetRange = rHead + 80.0;
        const minDist = Math.sqrt(minDistSq);

        if (minDist < magnetRange && minDist > 1.0) {
          const pullSpeed = 350.0;
          // Quadratic decay pull factor (starts very gentle, gets stronger close to mouth)
          const linearPullFactor = (magnetRange - minDist) / magnetRange;
          const pullFactor = linearPullFactor * linearPullFactor;
          
          const dx = nearestSnake.segments[0].x - food.x;
          const dy = nearestSnake.segments[0].y - food.y;

          const oldX = food.x;
          const oldY = food.y;

          food.x += (dx / minDist) * pullSpeed * pullFactor * dt;
          food.y += (dy / minDist) * pullSpeed * pullFactor * dt;

          this.updateFoodGridPosition(food.id, oldX, oldY, food.x, food.y);
        }
      }
    }
  }

  getFoodInRect(minX: number, minY: number, maxX: number, maxY: number): FoodItemJS[] {
    const results: FoodItemJS[] = [];
    const minCoords = this.getCellCoords(minX, minY);
    const maxCoords = this.getCellCoords(maxX, maxY);

    for (let col = minCoords.col; col <= maxCoords.col; ++col) {
      for (let row = minCoords.row; row <= maxCoords.row; ++row) {
        for (const id of this.grid[col][row]) {
          const food = this.foodMap.get(id);
          if (food) {
            if (food.x >= minX && food.x <= maxX && food.y >= minY && food.y <= maxY) {
              results.push(food);
            }
          }
        }
      }
    }
    return results;
  }
}

interface SegmentRefJS {
  snakeId: string;
  segmentIndex: number;
}

class SpatialGridJS {
  private cellSize: number;
  private cells: Map<string, SegmentRefJS[]> = new Map();

  constructor(cellSize = 120.0) {
    this.cellSize = cellSize;
  }

  clear() {
    this.cells.clear();
  }

  private toCol(x: number): number { return Math.floor(x / this.cellSize); }
  private toRow(y: number): number { return Math.floor(y / this.cellSize); }

  private cellKey(col: number, row: number): string {
    return `${col}_${row}`;
  }

  insert(x: number, y: number, snakeId: string, segmentIndex: number) {
    const key = this.cellKey(this.toCol(x), this.toRow(y));
    let cell = this.cells.get(key);
    if (!cell) {
      cell = [];
      this.cells.set(key, cell);
    }
    cell.push({ snakeId, segmentIndex });
  }

  queryRadius(cx: number, cy: number, radius: number): SegmentRefJS[] {
    const results: SegmentRefJS[] = [];

    const minCol = this.toCol(cx - radius);
    const maxCol = this.toCol(cx + radius);
    const minRow = this.toRow(cy - radius);
    const maxRow = this.toRow(cy + radius);

    for (let col = minCol; col <= maxCol; ++col) {
      for (let row = minRow; row <= maxRow; ++row) {
        const key = this.cellKey(col, row);
        const cell = this.cells.get(key);
        if (cell) {
          for (const ref of cell) {
            results.push(ref);
          }
        }
      }
    }

    return results;
  }
}

interface GameEventJS {
  type: string;  // "elimination" or "food_eaten"
  x: number;
  y: number;
  color: string;
  val: number;   // score or foodId
}

interface EliminationEventJS {
  playerId: string;
  score: number;
  rank: number;
  killerName: string;
}

export class GameEngineJS {
  public mapSize: number;
  public tick = 0;
  public snakes: Map<string, SnakeJS> = new Map();
  public foodManager: FoodManagerJS;
  public currentTickEvents: GameEventJS[] = [];

  static TARGET_FOOD_COUNT = TARGET_FOOD_COUNT;

  constructor(mapSize = 6000.0) {
    this.mapSize = mapSize;
    this.foodManager = new FoodManagerJS(mapSize);
    this.foodManager.spawnInitialFood(GameEngineJS.TARGET_FOOD_COUNT);
  }

  addPlayer(id: string, name: string): SnakeJS {
    // Spawn player at a random position inside the circle with a margin from the boundary
    const spawnRadius = (this.mapSize / 2) - 300.0;
    const r = Math.sqrt(Math.random()) * spawnRadius;
    const theta = Math.random() * 2 * Math.PI;
    const x = (this.mapSize / 2) + r * Math.cos(theta);
    const y = (this.mapSize / 2) + r * Math.sin(theta);

    const colors = [
      "#00f0ff", "#ff007f", "#39ff14", "#ffbf00",
      "#bd00ff", "#00ffcc", "#ff3300", "#ffff00"
    ];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const snake = new SnakeJS(id, name, x, y, color);
    this.snakes.set(id, snake);
    return snake;
  }

  removePlayer(id: string) {
    this.snakes.delete(id);
  }

  handleInput(id: string, angle: number, isBoosting: boolean) {
    const snake = this.snakes.get(id);
    if (snake) {
      snake.changeInput(angle, isBoosting);
    }
  }

  private collisionGrid = new SpatialGridJS(120.0);

  update(dt: number): EliminationEventJS[] {
    this.tick++;
    this.currentTickEvents = [];
    const eliminations: EliminationEventJS[] = [];

    // 1. Move all snakes; collect boundary deaths
    const boundaryDeaths: { id: string; killer: string }[] = [];
    for (const s of this.snakes.values()) {
      const res = s.update(dt, this.mapSize);
      if (!res.alive) {
        boundaryDeaths.push({ id: s.id, killer: "the boundary" });
        continue;
      }
      if (res.shouldSpawnFood) {
        this.foodManager.addFood(res.spawnX, res.spawnY, res.spawnMass, s.color);
      }
    }

    for (const d of boundaryDeaths) {
      this.eliminatePlayer(d.id, d.killer, eliminations);
    }
    if (this.snakes.size === 0) {
      this.foodManager.maintainDensity(GameEngineJS.TARGET_FOOD_COUNT);
      return eliminations;
    }

    // 2. Rebuild spatial hash grid for collision detection
    this.collisionGrid.clear();
    for (const s of this.snakes.values()) {
      for (let i = 0; i < s.segments.length; ++i) {
        this.collisionGrid.insert(s.segments[i].x, s.segments[i].y, s.id, i);
      }
    }

    // 3. Snake-on-snake collision checks
    const activeSnakes = Array.from(this.snakes.values());
    const pendingElims: Map<string, string> = new Map(); // id -> killerName

    for (let i = 0; i < activeSnakes.length; ++i) {
      const snakeA = activeSnakes[i];
      if (snakeA.segments.length === 0) continue;
      if (pendingElims.has(snakeA.id)) continue;

      const headA = snakeA.segments[0];
      const rA = snakeA.getRadius();
      const queryR = rA + 20.0;

      const nearby = this.collisionGrid.queryRadius(headA.x, headA.y, queryR);

      for (const ref of nearby) {
        if (ref.snakeId === snakeA.id) continue;

        const snakeB = this.snakes.get(ref.snakeId);
        if (!snakeB || snakeB.segments.length === 0) continue;

        const rB = snakeB.getRadius();
        const seg = snakeB.segments[ref.segmentIndex];
        const dx = headA.x - seg.x;
        const dy = headA.y - seg.y;
        const distSq = dx * dx + dy * dy;
        const hitRadius = (rA + rB) * 0.85;

        // Head-to-Body collision
        if (ref.segmentIndex > 0 && distSq < hitRadius * hitRadius) {
          pendingElims.set(snakeA.id, snakeB.name);
          break;
        }

        // Head-to-Head collision
        if (ref.segmentIndex === 0) {
          // ensure we only check once
          const j = activeSnakes.indexOf(snakeB);
          if (j <= i) continue;

          const hhRadius = (rA + rB) * 0.9;
          if (distSq < hhRadius * hhRadius) {
            if (snakeA.mass > snakeB.mass) {
              if (!pendingElims.has(snakeB.id)) {
                pendingElims.set(snakeB.id, snakeA.name);
              }
            } else if (snakeB.mass > snakeA.mass) {
              pendingElims.set(snakeA.id, snakeB.name);
              break;
            } else {
              pendingElims.set(snakeA.id, snakeB.name);
              pendingElims.set(snakeB.id, snakeA.name);
              break;
            }
          }
        }
      }
    }

    for (const [id, killer] of pendingElims.entries()) {
      this.eliminatePlayer(id, killer, eliminations);
    }

    // 4. Food magnetization and ingestion
    this.foodManager.updateMagnetization(this.snakes, dt);

    for (const s of this.snakes.values()) {
      if (s.segments.length === 0) continue;

      const head = s.segments[0];
      const rHead = s.getRadius();

      const nearbyFood = this.foodManager.getFoodInRect(
        head.x - (rHead + 15.0), head.y - (rHead + 15.0),
        head.x + (rHead + 15.0), head.y + (rHead + 15.0)
      );

      for (const food of nearbyFood) {
        const dx = head.x - food.x;
        const dy = head.y - food.y;
        const distSq = dx * dx + dy * dy;
        const eatR = rHead + 5.0;

        if (distSq < eatR * eatR) {
          s.grow(food.mass);
          this.foodManager.removeFood(food.id);
          this.currentTickEvents.push({ type: "food_eaten", x: head.x, y: head.y, color: "", val: food.id });
        }
      }
    }

    // 5. Maintain food density
    this.foodManager.maintainDensity(GameEngineJS.TARGET_FOOD_COUNT);

    return eliminations;
  }

  private eliminatePlayer(id: string, killerName: string, outEliminations: EliminationEventJS[]) {
    const s = this.snakes.get(id);
    if (!s) return;

    const score = Math.floor(s.mass);
    const head = s.segments[0];

    this.currentTickEvents.push({ type: "elimination", x: head.x, y: head.y, color: s.color, val: score });

    const dropMassTotal = Math.floor(s.mass * 0.5);
    const numSegments = s.segments.length;
    const massPerDrop = Math.max(2.0, Math.floor(dropMassTotal / Math.max(1, numSegments)));

    for (let idx = 0; idx < numSegments; idx++) {
      if (idx % 2 === 0 || idx === 0) {
        const ox = (Math.random() - 0.5) * 20.0;
        const oy = (Math.random() - 0.5) * 20.0;
        let fx = s.segments[idx].x + ox;
        let fy = s.segments[idx].y + oy;
        
        // Clamp to circular boundary
        const cx = this.mapSize / 2;
        const cy = this.mapSize / 2;
        const rMax = (this.mapSize / 2) - 20.0;
        const dx = fx - cx;
        const dy = fy - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > rMax) {
          fx = cx + (dx / dist) * rMax;
          fy = cy + (dy / dist) * rMax;
        }
        this.foodManager.addFood(fx, fy, massPerDrop, s.color);
      }
    }

    const leaderboard = this.getLeaderboard();
    let rank = 1;
    for (let idx = 0; idx < leaderboard.length; idx++) {
      if (leaderboard[idx][0] === s.name) {
        rank = idx + 1;
        break;
      }
    }

    outEliminations.push({ playerId: id, score, rank, killerName });
    this.snakes.delete(id);
  }

  getLeaderboard(): [string, number][] {
    const lb: [string, number][] = [];
    for (const s of this.snakes.values()) {
      lb.push([s.name, Math.floor(s.mass)]);
    }
    lb.sort((a, b) => b[1] - a[1]);
    if (lb.length > 10) lb.length = 10;
    return lb;
  }

  getSerializedState(playerId: string, ackSeq = 0): Buffer {
    let vx = this.mapSize / 2;
    let vy = this.mapSize / 2;
    const s = this.snakes.get(playerId);
    if (s && s.segments.length > 0) {
      vx = s.segments[0].x;
      vy = s.segments[0].y;
    }

    const halfView = 1400.0;
    const foodInRange = this.foodManager.getFoodInRect(
      vx - halfView, vy - halfView,
      vx + halfView, vy + halfView
    );

    const playersSerialized = Array.from(this.snakes.values()).map(s => {
      const segmentsSerialized = s.segments.map(seg => [
        Math.round(seg.x * 10.0) / 10.0,
        Math.round(seg.y * 10.0) / 10.0
      ]);
      return [
        s.id,
        s.name,
        s.color,
        Math.floor(s.mass),
        s.isBoosting,
        segmentsSerialized,
        s.id === playerId ? ackSeq : 0
      ];
    });

    const foodSerialized = foodInRange.map(f => [
      f.id,
      Math.round(f.x),
      Math.round(f.y),
      Math.round(f.mass),
      f.color
    ]);

    const eventsSerialized = this.currentTickEvents.map(ev => {
      if (ev.type === "elimination") {
        return [
          ev.type,
          Math.round(ev.x),
          Math.round(ev.y),
          ev.color,
          ev.val
        ];
      } else {
        return [
          ev.type,
          ev.val,
          Math.round(ev.x),
          Math.round(ev.y)
        ];
      }
    });

    // Protocol: S_GAME_STATE = [13, tick, ackSeq, players, foodItems, events]
    const stateArray = [
      13,
      this.tick,
      ackSeq,
      playersSerialized,
      foodSerialized,
      eventsSerialized
    ];

    const encoded = encode(stateArray);
    return Buffer.from(encoded.buffer, encoded.byteOffset, encoded.byteLength);
  }

  getSerializedLeaderboard(): Buffer {
    const leaderboard = this.getLeaderboard();
    const encoded = encode([
      14,
      leaderboard
    ]);
    return Buffer.from(encoded.buffer, encoded.byteOffset, encoded.byteLength);
  }
}
