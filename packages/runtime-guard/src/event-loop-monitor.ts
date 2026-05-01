import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';

/**
 * Tracks event loop delay percentiles via Node's built-in perf_hooks.
 * Lag spikes (p99 >> p50) often indicate sync work blocking the loop —
 * e.g., expensive JSON.stringify, sync fs operations, or heavy regex.
 *
 * Default resolution = 20ms. Histogram is internal to Node and adds
 * minimal overhead (sub-ms per sample).
 */
export interface EventLoopSnapshot {
  p50_ms: number;
  p99_ms: number;
  max_ms: number;
}

export class EventLoopMonitor {
  private histogram: IntervalHistogram | null = null;

  start(resolutionMs = 20): void {
    if (this.histogram) return;          // idempotent
    this.histogram = monitorEventLoopDelay({ resolution: resolutionMs });
    this.histogram.enable();
  }

  snapshot(): EventLoopSnapshot {
    // libuv's histogram returns its recordable_min (~511ns) from
    // percentile()/max even when no real samples have been recorded.
    // Use count to detect a truly empty histogram and report zeros.
    if (!this.histogram || this.histogram.count === 0) {
      return { p50_ms: 0, p99_ms: 0, max_ms: 0 };
    }
    return {
      p50_ms: this.histogram.percentile(50) / 1e6,    // ns -> ms
      p99_ms: this.histogram.percentile(99) / 1e6,
      max_ms: this.histogram.max / 1e6,
    };
  }

  reset(): void {
    this.histogram?.reset();
  }

  stop(): void {
    this.histogram?.disable();
    this.histogram = null;
  }
}
