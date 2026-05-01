/**
 * Per-key dedup window. Used by AlertRouter to suppress duplicate notifications
 * for the same event_type+reactor_id within a window (default 5 minutes).
 *
 * In-memory only; resets on process restart. Acceptable per spec since alerts
 * fire on rare conditions and resetting throttler at restart is intuitive.
 */
export interface ThrottlerOptions {
  windowMs?: number;
  now?: () => number;
}

export class Throttler {
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly lastFire = new Map<string, number>();
  private readonly throttled = new Map<string, number>();

  constructor(opts: ThrottlerOptions = {}) {
    this.windowMs = opts.windowMs ?? 5 * 60_000;
    this.now = opts.now ?? Date.now;
  }

  shouldAllow(key: string): boolean {
    const last = this.lastFire.get(key);
    if (last === undefined) return true;
    return this.now() - last >= this.windowMs;
  }

  record(key: string): void {
    this.lastFire.set(key, this.now());
    this.throttled.delete(key);    // reset count on a successful fire
  }

  recordThrottled(key: string): void {
    this.throttled.set(key, (this.throttled.get(key) ?? 0) + 1);
  }

  throttledCount(key: string): number {
    return this.throttled.get(key) ?? 0;
  }

  cleanupExpired(): void {
    const cutoff = this.now() - this.windowMs;
    for (const [k, t] of this.lastFire) {
      if (t < cutoff) this.lastFire.delete(k);
    }
  }
}
