import os from 'node:os';
import { EventLoopMonitor } from './event-loop-monitor';
import { inspectHandles } from './handles-inspector';
import { RingBuffer } from './ring-buffer';

/**
 * Aggregates process health into a single snapshot. Drives:
 *   - GET /api/v1/admin/health (latest snapshot + recent series)
 *   - GET /api/v1/admin/metrics (Prometheus exposition)
 *   - 24h time-series for the /admin/health frontend chart
 *
 * Default sample period 60s, retention 1440 points = 24h. Ring buffer means
 * O(1) memory regardless of process uptime.
 */

export interface HealthSnapshot {
  service: { pid: number; uptime_sec: number; node: string; version: string };
  memory: {
    heap_used_mb: number;
    heap_total_mb: number;
    rss_mb: number;
    oom_threshold_mb: number;
    oom_pct: number;
  };
  handles: { active: number; by_type: Record<string, number> };
  event_loop: { lag_p50_ms: number; lag_p99_ms: number; lag_max_ms: number };
  ts: string;
}

export interface MetricsCollectorOptions {
  samplePeriodMs?: number;
  retentionPoints?: number;
  oomThresholdMb?: number;
  serviceVersion?: string;
}

export class MetricsCollector {
  private readonly elm = new EventLoopMonitor();
  private readonly series: RingBuffer<HealthSnapshot>;
  private timer: NodeJS.Timeout | null = null;
  private readonly samplePeriodMs: number;
  private readonly oomThresholdMb: number;
  private readonly serviceVersion: string;

  constructor(opts: MetricsCollectorOptions = {}) {
    this.samplePeriodMs = opts.samplePeriodMs ?? 60_000;
    this.series = new RingBuffer<HealthSnapshot>(opts.retentionPoints ?? 1440);
    this.oomThresholdMb = opts.oomThresholdMb ?? Math.floor(os.totalmem() * 0.20 / 1024 / 1024);
    this.serviceVersion = opts.serviceVersion ?? '0.0.0';
  }

  start(): void {
    if (this.timer) return;
    this.elm.start();
    this.series.push(this.snapshot());
    this.timer = setInterval(() => this.series.push(this.snapshot()), this.samplePeriodMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.elm.stop();
  }

  snapshot(): HealthSnapshot {
    const mem = process.memoryUsage();
    const heapMb = mem.heapUsed / 1024 / 1024;
    const rssMb = mem.rss / 1024 / 1024;
    const lag = this.elm.snapshot();
    const handles = inspectHandles();
    return {
      service: {
        pid: process.pid,
        uptime_sec: Math.floor(process.uptime()),
        node: process.version,
        version: this.serviceVersion,
      },
      memory: {
        heap_used_mb: Math.round(heapMb),
        heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
        rss_mb: Math.round(rssMb),
        oom_threshold_mb: this.oomThresholdMb,
        oom_pct: Math.round((rssMb / this.oomThresholdMb) * 100),
      },
      handles: { active: handles.active, by_type: handles.byType },
      event_loop: {
        lag_p50_ms: +lag.p50_ms.toFixed(2),
        lag_p99_ms: +lag.p99_ms.toFixed(2),
        lag_max_ms: +lag.max_ms.toFixed(2),
      },
      ts: new Date().toISOString(),
    };
  }

  timeSeries(): HealthSnapshot[] {
    return this.series.toArray();
  }
}
