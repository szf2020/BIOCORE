import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bindGaugesToRealtime } from '../tag-binding-bridge';
import type { GaugeBase } from '../../gauges/gauge-base';

const { mockSubscribe } = vi.hoisted(() => ({ mockSubscribe: vi.fn() }));

vi.mock('@/stores/realtime-store', () => ({
  useRealtimeStore: { subscribe: mockSubscribe },
}));

vi.mock('../tag-binding', () => ({
  readTagSnapshot: (tagId: string) => ({ value: 42, tagId, isStale: false }),
}));

function makeGauge(): GaugeBase {
  return {
    onMount: vi.fn(),
    onUnmount: vi.fn(),
    onProcess: vi.fn(),
  } as unknown as GaugeBase;
}

describe('bindGaugesToRealtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscribe.mockReturnValue(() => undefined);
  });

  it('subscribe -> gauge.onProcess called with snapshot on processValues update', () => {
    const gauge = makeGauge();
    const gauges = new Map([['w1', gauge]]);
    const widgetSignals = new Map([['w1', ['TAG_01']]]);

    let capturedCallback: ((pv: unknown) => void) | undefined;
    mockSubscribe.mockImplementation(
      (_selector: unknown, cb: (pv: unknown) => void) => {
        capturedCallback = cb;
        return () => undefined;
      },
    );

    bindGaugesToRealtime('F01', gauges, widgetSignals);
    capturedCallback?.({ TAG_01: 99 });
    expect(gauge.onProcess).toHaveBeenCalledOnce();
  });

  it('unsubscribe -> no further calls after cleanup', () => {
    const gauge = makeGauge();
    const gauges = new Map([['w1', gauge]]);
    const widgetSignals = new Map([['w1', ['TAG_01']]]);
    const mockUnsub = vi.fn();

    let capturedCallback: ((pv: unknown) => void) | undefined;
    mockSubscribe.mockImplementation(
      (_selector: unknown, cb: (pv: unknown) => void) => {
        capturedCallback = cb;
        return mockUnsub;
      },
    );

    const unsub = bindGaugesToRealtime('F01', gauges, widgetSignals);
    unsub();
    expect(mockUnsub).toHaveBeenCalledOnce();

    const callsBefore = (gauge.onProcess as ReturnType<typeof vi.fn>).mock.calls.length;
    capturedCallback?.({ TAG_01: 66 });
    expect((gauge.onProcess as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
  });

  it('multiple gauges -> all called per tick', () => {
    const g1 = makeGauge();
    const g2 = makeGauge();
    const gauges = new Map([['w1', g1], ['w2', g2]]);
    const widgetSignals = new Map([['w1', ['TAG_A']], ['w2', ['TAG_B']]]);

    let capturedCallback: ((pv: unknown) => void) | undefined;
    mockSubscribe.mockImplementation(
      (_selector: unknown, cb: (pv: unknown) => void) => {
        capturedCallback = cb;
        return () => undefined;
      },
    );

    bindGaugesToRealtime('F01', gauges, widgetSignals);
    capturedCallback?.({ TAG_A: 10, TAG_B: 20 });
    expect(g1.onProcess).toHaveBeenCalledOnce();
    expect(g2.onProcess).toHaveBeenCalledOnce();
  });
});
