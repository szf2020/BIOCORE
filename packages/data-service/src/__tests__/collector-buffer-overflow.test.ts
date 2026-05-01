// ============================================================
// Risk #2 regression guard — DataCollector buffer overflow + timer cleanup
// ============================================================
// Hypothesis from spec §4.2:
//   "Influx 写入失败时缓冲队列是否无限增长？collector 在 batch 切换时是否
//    cleanup 旧 timer？"
//
// Investigation finding (T6):
//   - DataCollector internally caps buffer at 120 samples
//     (collector.ts L146: `if (this.buffer.length > 120) this.buffer.shift()`).
//   - There is NO injected influx client inside the collector — it only
//     emits 'record' events; downstream Influx writing happens elsewhere.
//     So a stuck downstream cannot back-pressure into the collector.
//   - stop() explicitly clearInterval()s both realtimeTimer and recordTimer
//     and sets them to null (collector.ts L131-137).
//
// These tests therefore act as a regression guard: if anyone removes the
// L146 shift OR removes the clearInterval calls in stop(), this suite
// will fail.
// ============================================================

import { describe, it, expect } from 'vitest';
import { DataCollector } from '../collector';

describe('DataCollector buffer overflow protection (risk #2 regression guard)', () => {
  it('buffer never exceeds the internal cap (120) even when records are not consumed', async () => {
    // Strategy: drive the collector with a fast sample interval and a record
    // interval longer than the test, so buffer accumulates without being
    // drained. Verify the internal cap holds.
    const collector = new DataCollector({
      reactorId: 'F01',
      batchId: null,        // null batchId → record() will dump buffer; use null to test the
                            // pure overflow path we still want capped via shift().
      liquidVolumeL: 5,
      sampleIntervalMs: 5,  // very fast
      recordIntervalMs: 60_000, // never fires within test window
    });

    collector.setDataSource(async () => ({
      TEMP_PV: 37, PH_PV: 7, DO_PV: 30, PRESSURE_PV: 0.5,
      AIRFLOW_PV: 10, WEIGHT_PV: 7, VFD_ACTUAL_FREQ: 20,
      VFD_CURRENT: 2, STEAM_CV: 0, COOL_CV: 0, AIR_CV: 0,
    }));

    // Track max buffer depth seen during the run.
    let maxDepth = 0;

    collector.start();
    // Run long enough to push >>120 samples (5ms × 200 = 1000ms ≈ 200 samples).
    const t0 = Date.now();
    while (Date.now() - t0 < 1500) {
      maxDepth = Math.max(maxDepth, collector.getBufferSize());
      await new Promise((r) => setTimeout(r, 10));
    }
    collector.stop();

    // The internal cap is 120. If anyone removes the `shift()` line, this
    // assertion will fail (depth would grow to ~300).
    expect(maxDepth).toBeLessThanOrEqual(120);
    // Also sanity: we DID push enough samples to trigger the cap at least once.
    expect(maxDepth).toBeGreaterThan(50);
  });

  it('stop() clears both interval timers (clearInterval called for each)', async () => {
    // Spy on clearInterval to assert that stop() releases both timers.
    // (Active-handle counting is unreliable inside vitest workers because
    // they pool/proxy timer handles; spying on the API gives us a precise,
    // implementation-faithful regression guard for the cleanup path.)
    const realClear = global.clearInterval;
    const cleared: any[] = [];
    global.clearInterval = ((h: any) => {
      cleared.push(h);
      return realClear(h);
    }) as any;

    try {
      const collector = new DataCollector({
        reactorId: 'F01',
        batchId: 'B1',
        liquidVolumeL: 5,
        sampleIntervalMs: 50,
        recordIntervalMs: 100,
      });
      collector.setDataSource(async () => ({
        TEMP_PV: 37, PH_PV: 7, DO_PV: 30,
      }));

      collector.start();
      // Run briefly to ensure timers are alive.
      await new Promise((r) => setTimeout(r, 80));

      const beforeStop = cleared.length;
      collector.stop();

      // stop() must invoke clearInterval at least twice (realtimeTimer +
      // recordTimer). If anyone removes either clearInterval call, this
      // assertion fails.
      const releasedByStop = cleared.length - beforeStop;
      expect(releasedByStop).toBeGreaterThanOrEqual(2);
    } finally {
      global.clearInterval = realClear;
    }
  });

  it('stop() nulls out internal timer references (no dangling handles)', async () => {
    // Verifies the L133-134 contract: `this.realtimeTimer = null;
    // this.recordTimer = null;`.  We can't read the private fields from
    // outside, so we use a behavioural proxy: after stop(), the running
    // flag is false AND no further sample() invocations occur.
    const collector = new DataCollector({
      reactorId: 'F01',
      batchId: 'B1',
      liquidVolumeL: 5,
      sampleIntervalMs: 20,
      recordIntervalMs: 5_000,
    });

    let sampleCount = 0;
    collector.setDataSource(async () => {
      sampleCount++;
      return { TEMP_PV: 37 };
    });

    collector.start();
    await new Promise((r) => setTimeout(r, 100));
    expect(collector.isRunning()).toBe(true);
    expect(sampleCount).toBeGreaterThan(0);

    collector.stop();
    expect(collector.isRunning()).toBe(false);

    const countAtStop = sampleCount;
    // After stop(), no more samples should fire even if we wait several
    // sample-intervals. If stop() forgot to clear the realtimeTimer,
    // sampleCount would keep climbing.
    await new Promise((r) => setTimeout(r, 150));
    expect(sampleCount).toBe(countAtStop);
  });

  it('start() is idempotent — calling twice does not double-register timers', async () => {
    // Regression guard for the `if (this.running) return;` early-out at L119.
    let setIntervalCalls = 0;
    const realSet = global.setInterval;
    global.setInterval = ((...args: any[]) => {
      setIntervalCalls++;
      return (realSet as any)(...args);
    }) as any;

    try {
      const collector = new DataCollector({
        reactorId: 'F01',
        batchId: 'B1',
        liquidVolumeL: 5,
        sampleIntervalMs: 50,
        recordIntervalMs: 100,
      });
      collector.setDataSource(async () => ({ TEMP_PV: 37 }));

      collector.start();
      const after1 = setIntervalCalls;
      collector.start(); // second call should be a no-op
      const after2 = setIntervalCalls;

      expect(after2).toBe(after1); // no extra setInterval calls

      collector.stop();
    } finally {
      global.setInterval = realSet;
    }
  });

  it('setBatch() while running does not create new timers (no leak path)', async () => {
    // setBatch only resets cumulative values; it must NOT call setInterval.
    // This guard catches anyone who later changes setBatch to recreate
    // timers without first cleaning the old ones.
    let setIntervalCalls = 0;
    const realSet = global.setInterval;
    global.setInterval = ((...args: any[]) => {
      setIntervalCalls++;
      return (realSet as any)(...args);
    }) as any;

    try {
      const collector = new DataCollector({
        reactorId: 'F01',
        batchId: 'B1',
        liquidVolumeL: 5,
        sampleIntervalMs: 50,
        recordIntervalMs: 100,
      });
      collector.setDataSource(async () => ({ TEMP_PV: 37 }));

      collector.start();
      const baselineCalls = setIntervalCalls; // exactly 2 expected
      expect(baselineCalls).toBe(2);

      collector.setBatch('B2', 8);
      collector.setBatch('B3', 10);
      collector.setBatch(null);

      // setBatch must not call setInterval — count is unchanged.
      expect(setIntervalCalls).toBe(baselineCalls);

      collector.stop();
    } finally {
      global.setInterval = realSet;
    }
  });
});
