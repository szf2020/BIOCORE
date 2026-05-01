/**
 * Fixed-capacity FIFO buffer. When `push` would exceed `capacity`, the
 * oldest item is evicted. Used by metrics-collector and SSE event stream
 * to bound memory usage during long runs.
 */
export class RingBuffer<T> {
  private items: T[] = [];

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`RingBuffer capacity must be a positive integer; got ${capacity}`);
    }
  }

  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.capacity) {
      this.items.shift();
    }
  }

  toArray(): T[] {
    return [...this.items];
  }

  size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
  }
}
