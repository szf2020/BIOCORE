// ============================================================
// watchdog-cleanup.test.ts — risk #4 回归防护
//
// 风险 #4 (硬化规划 §4.4): "BatchController.complete() / stop() 时 watchdog
// timer 是否清理? 多次 start/complete 循环后是否堆积?"
//
// 调查结论 (T11):
//   1. CommWatchdog 不归 BatchController 直接持有, 由外部组合;
//      BatchController 仅暴露 onCommLoss(reason) hook, 没有 watchdog 字段.
//      所以"BatchController complete/stop 必须调 watchdog.stop()"这条
//      在当前代码并不成立 — 不是 bug, 是结构使然.
//   2. CommWatchdog 自身的 timer 生命周期(loss→restored 单实例正常):
//        - safetyTimer 仅在 plc 'comm_loss' 事件触发时 setTimeout
//        - 在 'comm_restored' 时 clearTimeout 且置 null (comm-watchdog.ts:83-86)
//        - destroy() 也 clearTimeout (comm-watchdog.ts:124-127)
//      所以在单实例 loss→restored 循环 N 次后, 不会堆积 timer (前 3 个 case 验证).
//   3. ⚠️ 已确认真 bug: destroy() 不解绑自身在 plc EventEmitter 上的 4 个
//      listener (comm_loss / comm_restored / reconnecting / reconnected).
//      若同一个 plc 实例上反复 new + destroy 多个 CommWatchdog (例如每个批次
//      一个 watchdog), listener 数量线性累积, 触发 MaxListenersExceededWarning,
//      并导致单次 comm_loss emit 触发所有遗留实例的 setTimeout 副作用 →
//      timer 堆积 = listener 堆积的下游症状.
//      第 4 个 case (it.fails) 锁定该 bug, 等待修复后改回 it()。
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { CommWatchdog } from '../comm-watchdog';
import type { PLCConnectionManager } from '@biocore/plc-driver';

// ─── Helpers ────────────────────────────────────────────────

/** 用 EventEmitter 模拟 PLCConnectionManager (CommWatchdog 只用其 .on()). */
function makeFakePlc(): PLCConnectionManager {
  return new EventEmitter() as unknown as PLCConnectionManager;
}

describe('CommWatchdog timer cleanup (risk #4 regression guard)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not leak setTimeout handles across N comm_loss → comm_restored cycles', () => {
    const setSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');

    const plc = makeFakePlc();
    const wd = new CommWatchdog(plc, { maxSafeHoldDuration_s: 60 });

    const N = 100;
    const baselineSet = setSpy.mock.calls.length;
    const baselineClear = clearSpy.mock.calls.length;

    for (let i = 0; i < N; i++) {
      // 模拟 PLC 抛出 comm_loss → watchdog 启动 safetyTimer
      plc.emit('comm_loss', { id: `plc-${i}`, reason: 'test heartbeat' });
      // 模拟通讯恢复 → watchdog 应 clearTimeout + null
      plc.emit('comm_restored', { id: `plc-${i}`, downtime_s: 1 });
    }

    const setDelta = setSpy.mock.calls.length - baselineSet;
    const clearDelta = clearSpy.mock.calls.length - baselineClear;

    // 每个循环: 1 次 setTimeout, 1 次 clearTimeout — 完全配对
    expect(setDelta).toBe(N);
    expect(clearDelta).toBe(N);

    // 内部状态被还原: 不再处于 commLost, 也无 hold duration
    expect(wd.isCommLost()).toBe(false);
    expect(wd.getHoldDuration()).toBe(0);

    wd.destroy();
  });

  it('destroy() clears the active safetyTimer when called mid-loss', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');

    const plc = makeFakePlc();
    const wd = new CommWatchdog(plc, { maxSafeHoldDuration_s: 60 });

    plc.emit('comm_loss', { id: 'plc-1', reason: 'test' });
    expect(wd.isCommLost()).toBe(true);

    const baseline = clearSpy.mock.calls.length;
    wd.destroy();
    const delta = clearSpy.mock.calls.length - baseline;

    // destroy() 必须清掉活跃的 safetyTimer
    expect(delta).toBeGreaterThanOrEqual(1);
  });

  it('repeated comm_loss events while already lost do not stack timers', () => {
    const setSpy = vi.spyOn(globalThis, 'setTimeout');

    const plc = makeFakePlc();
    const wd = new CommWatchdog(plc, { maxSafeHoldDuration_s: 60 });

    const baseline = setSpy.mock.calls.length;
    // 首次 comm_loss 应启动一次 timer
    plc.emit('comm_loss', { id: 'plc-1', reason: 'first' });
    // 再 emit 9 次, 由于 commLost guard, 不应再启动 timer
    for (let i = 0; i < 9; i++) {
      plc.emit('comm_loss', { id: 'plc-1', reason: 'duplicate' });
    }
    const delta = setSpy.mock.calls.length - baseline;

    expect(delta).toBe(1); // 仅首次 emit 起 timer

    wd.destroy();
  });

  // ── REGRESSION GUARD (T12 修复): destroy() 必须解绑 plc 上的 4 个 listener ──
  // 修复前: 反复 new+destroy 同一 plc, 旧实例仍响应 comm_loss → setTimeout 累积
  // (sum 1..N = N*(N+1)/2), 同时触发 MaxListenersExceededWarning.
  // 修复后: comm-watchdog.ts destroy() 调用 plc.off(...) 解绑 4 个 handler →
  // 每周期仅当前实例 1 次 setTimeout, setDelta === N.
  it('does not accumulate timers across many destroy/create cycles on same plc', () => {
    const setSpy = vi.spyOn(globalThis, 'setTimeout');

    const plc = makeFakePlc();
    // 提高 listener 上限避免 warning 干扰测试输出 (本身也是 bug 信号)
    (plc as unknown as EventEmitter).setMaxListeners(1000);
    const N = 50;

    const baselineSet = setSpy.mock.calls.length;

    for (let i = 0; i < N; i++) {
      const wd = new CommWatchdog(plc, { maxSafeHoldDuration_s: 60 });
      plc.emit('comm_loss', { id: `plc-${i}`, reason: 'test' });
      plc.emit('comm_restored', { id: `plc-${i}`, downtime_s: 1 });
      wd.destroy();
    }

    const setDelta = setSpy.mock.calls.length - baselineSet;

    // 修复后期望: 每周期仅 1 次 setTimeout (当前实例)
    expect(setDelta).toBe(N);
  });
});
