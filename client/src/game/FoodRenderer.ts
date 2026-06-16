import { Container, Graphics } from 'pixi.js';
import { FoodItemState } from './NetworkClient';

export class FoodRenderer {
  public graphics: Graphics;

  private static BASE_FOOD_RADIUS = 3.5;

  constructor(parentContainer: Container) {
    this.graphics = new Graphics();
    this.graphics.zIndex = 1; // Render food below snakes, but above grid
    parentContainer.addChild(this.graphics);
  }

  public render(foodItems: Map<number, FoodItemState>) {
    this.graphics.clear();

    if (foodItems.size === 0) return;

    // Pulse multiplier based on time
    const time = Date.now() * 0.005;
    const pulse = 1.0 + Math.sin(time) * 0.12;

    foodItems.forEach((food) => {
      // Scale radius slightly with mass
      const baseR = FoodRenderer.BASE_FOOD_RADIUS + Math.min(6, food.mass * 0.4);
      const r = baseR * pulse;
      
      const numericColor = parseInt(food.color.replace('#', '0x'), 16);

      // 1. Draw outer glowing halo (semi-transparent, wide)
      this.graphics.beginFill(numericColor, 0.12);
      this.graphics.drawCircle(food.x, food.y, r * 3.0);
      this.graphics.endFill();

      // 2. Draw secondary neon halo
      this.graphics.beginFill(numericColor, 0.32);
      this.graphics.drawCircle(food.x, food.y, r * 1.8);
      this.graphics.endFill();

      // 3. Draw solid inner core
      this.graphics.beginFill(numericColor, 1.0);
      this.graphics.drawCircle(food.x, food.y, r);
      this.graphics.endFill();

      // 4. Hot white core for high-intensity glow
      this.graphics.beginFill(0xffffff, 0.75);
      this.graphics.drawCircle(food.x, food.y, r * 0.45);
      this.graphics.endFill();
    });
  }

  public destroy() {
    this.graphics.destroy();
  }
}
