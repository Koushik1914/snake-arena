/**
 * ObjectPool<T> — Generic zero-allocation object pool.
 *
 * Pre-allocates a fixed pool of objects and recycles them instead of
 * creating/destroying during gameplay (avoids GC pressure).
 *
 * Usage:
 *   const pool = new ObjectPool(() => new Sprite(tex), (s) => { s.visible = false; }, 512);
 *   const sprite = pool.acquire();
 *   // ... use sprite ...
 *   pool.release(sprite);
 */
export class ObjectPool<T> {
  private free:    T[] = [];
  private inUse:   Set<T> = new Set();
  private factory:  () => T;
  private reset:    (obj: T) => void;
  private maxSize:  number;

  /**
   * @param factory   Creates a fresh instance.
   * @param reset     Resets an instance before returning it to the pool.
   * @param prewarm   Number of instances to pre-allocate immediately.
   * @param maxSize   Hard cap on pool size (surplus acquire() calls create temporary objects).
   */
  constructor(
    factory:  () => T,
    reset:    (obj: T) => void,
    prewarm = 0,
    maxSize = 1024,
  ) {
    this.factory  = factory;
    this.reset    = reset;
    this.maxSize  = maxSize;

    for (let i = 0; i < prewarm; i++) {
      this.free.push(factory());
    }
  }

  /** Retrieve an object from the pool (or create a new one if pool is empty). */
  public acquire(): T {
    let obj: T;
    if (this.free.length > 0) {
      obj = this.free.pop()!;
    } else {
      obj = this.factory();
    }
    this.inUse.add(obj);
    return obj;
  }

  /** Return an object back to the pool. It will be reset before reuse. */
  public release(obj: T): void {
    if (!this.inUse.has(obj)) return;
    this.inUse.delete(obj);
    this.reset(obj);
    if (this.free.length < this.maxSize) {
      this.free.push(obj);
    }
  }

  /** Release all currently in-use objects back to the pool. */
  public releaseAll(): void {
    for (const obj of this.inUse) {
      this.reset(obj);
      if (this.free.length < this.maxSize) {
        this.free.push(obj);
      }
    }
    this.inUse.clear();
  }

  public get activeCount(): number { return this.inUse.size;  }
  public get freeCount():   number { return this.free.length; }
  public get totalCount():  number { return this.inUse.size + this.free.length; }
}
