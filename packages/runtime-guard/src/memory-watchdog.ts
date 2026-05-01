import os from 'node:os';

/**
 * Periodic RSS watchdog. Fires `onExceed` after `graceSamples` consecutive
 * over-threshold samples (avoids false positives from transient spikes).
 *
 * Default threshold = 20% of system RAM (BIOCore standard, see hardening spec
 * §1 decision 4). Caller typically responds by writing a heap snapshot and
 * sending SIGTERM to let supervisor restart cleanly.
 */
export interface MemoryWatchdogOptions {
  thresholdMb?: number;
  sampleIntervalMs?: number;
  graceSamples?: number;
  onExceed: (info: { rss_mb: number; threshold_mb: number; samples: number }) => void | Promise<void>;
}

export class MemoryWatchdog {
  private timer: NodeJS.Timeout | null = null;
  private consecutiveOver = 0;
  private readonly thresholdMb: number;
  private readonly sampleIntervalMs: number;
  private readonly graceSamples: number;
  private readonly onExceed: MemoryWatchdogOptions['onExceed'];

  constructor(opts: MemoryWatchdogOptions) {
    this.thresholdMb = opts.thresholdMb ?? Math.floor(os.totalmem() * 0.20 / 1024 / 1024);
    this.sampleIntervalMs = opts.sampleIntervalMs ?? 30_000;
    this.graceSamples = opts.graceSamples ?? 3;
    this.onExceed = opts.onExceed;
  }

  start(): void {
    if (this.timer) return;       // idempotent
    this.timer = setInterval(() => this.sample(), this.sampleIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.consecutiveOver = 0;
  }

  getThresholdMb(): number {
    return this.thresholdMb;
  }

  private sample(): void {
    const rssMb = process.memoryUsage().rss / 1024 / 1024;
    if (rssMb > this.thresholdMb) {
      this.consecutiveOver++;
      if (this.consecutiveOver >= this.graceSamples) {
        const snapshot = { rss_mb: rssMb, threshold_mb: this.thresholdMb, samples: this.consecutiveOver };
        try {
          const r = this.onExceed(snapshot);
          if (r && typeof (r as Promise<unknown>).catch === 'function') {
            (r as Promise<unknown>).catch(() => { /* swallow */ });
          }
        } catch {
          /* swallow sync throws */
        }
        this.consecutiveOver = 0;   // reset after firing
      }
    } else {
      this.consecutiveOver = 0;
    }
  }
}
