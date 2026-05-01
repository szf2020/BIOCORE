import { describe, it, expect, afterEach } from 'vitest';
import os from 'node:os';
import { MetricsCollector } from '../metrics-collector';

describe('MetricsCollector', () => {
  const collectors: MetricsCollector[] = [];
  afterEach(() => {
    for (const c of collectors) c.stop();
    collectors.length = 0;
  });
  function track<T extends MetricsCollector>(c: T): T { collectors.push(c); return c; }

  it('produces a HealthSnapshot with all required fields', () => {
    const c = track(new MetricsCollector());
    c.start();
    const s = c.snapshot();
    expect(s.service.pid).toBe(process.pid);
    expect(s.service.uptime_sec).toBeGreaterThanOrEqual(0);
    expect(s.service.node).toMatch(/^v\d+/);
    expect(s.memory.heap_used_mb).toBeGreaterThan(0);
    expect(s.memory.rss_mb).toBeGreaterThan(0);
    expect(s.memory.oom_threshold_mb).toBeGreaterThan(0);
    expect(s.memory.oom_pct).toBeGreaterThanOrEqual(0);
    expect(s.handles.active).toBeGreaterThanOrEqual(0);
    expect(s.event_loop.lag_p50_ms).toBeGreaterThanOrEqual(0);
    expect(s.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('timeSeries() returns initial sample after start()', () => {
    const c = track(new MetricsCollector({ samplePeriodMs: 1000 }));
    c.start();
    const series = c.timeSeries();
    expect(series.length).toBe(1);
  });

  it('timeSeries() accumulates samples on interval', async () => {
    const c = track(new MetricsCollector({ samplePeriodMs: 50, retentionPoints: 100 }));
    c.start();
    await new Promise(r => setTimeout(r, 250));
    const series = c.timeSeries();
    expect(series.length).toBeGreaterThan(2);
  });

  it('timeSeries() ring-buffers at retentionPoints', async () => {
    const c = track(new MetricsCollector({ samplePeriodMs: 20, retentionPoints: 5 }));
    c.start();
    await new Promise(r => setTimeout(r, 200));
    expect(c.timeSeries().length).toBeLessThanOrEqual(5);
  });

  it('snapshot() works without start() (uses fresh sample)', () => {
    const c = track(new MetricsCollector());
    const s = c.snapshot();
    expect(s.service.pid).toBe(process.pid);
  });

  it('respects custom oomThresholdMb', () => {
    const c = track(new MetricsCollector({ oomThresholdMb: 1234 }));
    c.start();
    const s = c.snapshot();
    expect(s.memory.oom_threshold_mb).toBe(1234);
  });

  it('default oomThresholdMb is auto (20% RAM)', () => {
    const c = track(new MetricsCollector());
    c.start();
    const s = c.snapshot();
    const expected = Math.floor(os.totalmem() * 0.20 / 1024 / 1024);
    expect(s.memory.oom_threshold_mb).toBe(expected);
  });

  it('stop() can be called without start()', () => {
    const c = new MetricsCollector();
    expect(() => c.stop()).not.toThrow();
  });

  it('start() is idempotent', () => {
    const c = track(new MetricsCollector({ samplePeriodMs: 1000 }));
    c.start();
    c.start();   // 2nd no-op
    // not throwing is enough
  });
});
