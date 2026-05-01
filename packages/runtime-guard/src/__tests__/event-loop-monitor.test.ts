import { describe, it, expect } from 'vitest';
import { EventLoopMonitor } from '../event-loop-monitor';

describe('EventLoopMonitor', () => {
  it('reports lag p50/p99/max after sampling', async () => {
    const m = new EventLoopMonitor();
    m.start();
    await new Promise(r => setTimeout(r, 200));
    const r = m.snapshot();
    m.stop();
    expect(r.p50_ms).toBeGreaterThanOrEqual(0);
    expect(r.p99_ms).toBeGreaterThanOrEqual(r.p50_ms);
    expect(r.max_ms).toBeGreaterThanOrEqual(r.p99_ms);
  });

  it('returns zeros before start()', () => {
    const m = new EventLoopMonitor();
    const r = m.snapshot();
    expect(r).toEqual({ p50_ms: 0, p99_ms: 0, max_ms: 0 });
  });

  it('reset() clears histogram', async () => {
    const m = new EventLoopMonitor();
    m.start();
    await new Promise(r => setTimeout(r, 100));
    m.reset();
    const r = m.snapshot();
    m.stop();
    // After reset histogram is empty -> percentiles should be 0
    expect(r.p50_ms).toBe(0);
  });

  it('stop() can be called without start() without throwing', () => {
    const m = new EventLoopMonitor();
    expect(() => m.stop()).not.toThrow();
  });

  it('stop() is idempotent', () => {
    const m = new EventLoopMonitor();
    m.start();
    m.stop();
    expect(() => m.stop()).not.toThrow();
  });
});
