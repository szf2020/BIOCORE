/**
 * SP-FX-31: RuntimeCanvas hot-swap integration tests.
 * 验证 Effect G: gaugeRegistry.onReplace 订阅 → widget re-mount 行为.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { RuntimeCanvas } from '../RuntimeCanvas';
import type { FuxaView } from '../../models';
import type { GaugeReplaceEvent } from '../../gauges/gauge-base';

// ---------- hoisted mocks ----------
const {
  mockOldGauge,
  mockNewGauge,
  mockUnbind,
  mockDestroy,
  mockOnReplaceUnsub,
  capturedOnReplaceCallback,
} = vi.hoisted(() => {
  const mockDestroy = vi.fn();
  const mockUnbind = vi.fn();
  const mockOnReplaceUnsub = vi.fn();

  // 回调容器 — 通过引用共享，Effect G 注册时写入
  const capturedOnReplaceCallback = { fn: null as ((e: GaugeReplaceEvent) => void) | null };

  const mockOldGauge = { onMount: vi.fn(), onUnmount: vi.fn(), onProcess: vi.fn(), onClick: vi.fn() };
  const mockNewGauge = { onMount: vi.fn(), onUnmount: vi.fn(), onProcess: vi.fn(), onClick: vi.fn() };

  const mockCanvasCtrl = {
    loadView: vi.fn(),
    destroy: mockDestroy,
    widgetLayer: { node: document.createElementNS('http://www.w3.org/2000/svg', 'g') },
    root: { node: document.createElementNS('http://www.w3.org/2000/svg', 'svg') },
  };

  return {
    mockCanvasCtrl,
    mockOldGauge,
    mockNewGauge,
    mockUnbind,
    mockDestroy,
    mockOnReplaceUnsub,
    capturedOnReplaceCallback,
  };
});

// ---------- module mocks ----------
vi.mock('../../editor/canvas-svg', () => ({
  CanvasController: vi.fn().mockImplementation(() => mockDestroy && {
    loadView: vi.fn(),
    destroy: mockDestroy,
    widgetLayer: { node: document.createElementNS('http://www.w3.org/2000/svg', 'g') },
    root: { node: document.createElementNS('http://www.w3.org/2000/svg', 'svg') },
  }),
}));

vi.mock('../../gauges/gauge-registry', () => ({
  gaugeRegistry: {
    create: vi.fn().mockImplementation(() => mockOldGauge),
    getSignals: vi.fn().mockReturnValue(['TAG_01']),
    onReplace: vi.fn().mockImplementation((cb: (e: GaugeReplaceEvent) => void) => {
      capturedOnReplaceCallback.fn = cb;
      return mockOnReplaceUnsub;
    }),
  },
}));

vi.mock('../../services/tag-binding-bridge', () => ({
  bindGaugesToRealtime: vi.fn().mockReturnValue(mockUnbind),
}));

vi.mock('../../services/animation-engine', () => ({
  resolveAnimations: vi.fn().mockReturnValue([]),
  evalAnimations: vi.fn().mockReturnValue([]),
}));

const { mockStoreUnsubscribe, mockRealtimeStore } = vi.hoisted(() => {
  const mockStoreUnsubscribe = vi.fn();
  const mockRealtimeStore = { subscribe: vi.fn().mockReturnValue(mockStoreUnsubscribe) };
  return { mockStoreUnsubscribe, mockRealtimeStore };
});

vi.mock('@/stores/realtime-store', () => ({
  useRealtimeStore: mockRealtimeStore,
}));

vi.mock('@/components/scada/runtime/WriteIntentDialog', () => ({
  WriteIntentDialog: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="write-intent-dialog"><button onClick={onClose}>close</button></div>
  ),
}));

vi.mock('../../gauges/controls/index', () => ({}));

// ---------- import mocked modules (after vi.mock) ----------
import { gaugeRegistry } from '../../gauges/gauge-registry';

// ---------- helpers ----------
function makeView(items: FuxaView['items'] = {}): FuxaView {
  return {
    id: 'v1', name: 'Hot-Swap View',
    svgcontent: '<svg></svg>',
    width: 800, height: 600,
    items,
  } as unknown as FuxaView;
}

function makeWidget(id: string, type = 'svg-ext-gauge'): any {
  return {
    id, type,
    x: 0, y: 0, w: 100, h: 40, rotate: 0, lock: false, hide: false,
    property: { variableId: 'TAG_01' },
    svgcontent: '',
  };
}

function makeReplaceEvent(widgetType: string): GaugeReplaceEvent {
  const oldMeta = { widgetType, create: () => mockOldGauge, getSignals: () => [] };
  const newMeta = { widgetType, create: () => mockNewGauge, getSignals: () => [] };
  return { widgetType, oldMeta, newMeta, timestamp: Date.now() };
}

// ---------- tests ----------
describe('RuntimeCanvas hot-swap (SP-FX-31 Effect G)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnReplaceCallback.fn = null;
    // clearAllMocks 后重置 onReplace 实现以捕获新的回调
    (gaugeRegistry.onReplace as ReturnType<typeof vi.fn>).mockImplementation(
      (cb: (e: GaugeReplaceEvent) => void) => {
        capturedOnReplaceCallback.fn = cb;
        return mockOnReplaceUnsub;
      },
    );
    (gaugeRegistry.create as ReturnType<typeof vi.fn>).mockImplementation(() => mockOldGauge);
  });

  it('T1: mount 1 widget → gauge.onMount 被调用 1 次', () => {
    const view = makeView({ w1: makeWidget('w1', 'svg-ext-gauge') });
    render(<RuntimeCanvas view={view} viewId="v1" reactorId="F01" />);
    expect(mockOldGauge.onMount).toHaveBeenCalledOnce();
  });

  it('T2: Effect G 注册 onReplace 订阅', () => {
    const view = makeView({ w1: makeWidget('w1', 'svg-ext-gauge') });
    render(<RuntimeCanvas view={view} viewId="v1" reactorId="F01" />);
    expect(gaugeRegistry.onReplace).toHaveBeenCalledOnce();
  });

  it('T3: onReplace fire → 旧 gauge.onUnmount 被调用', async () => {
    const view = makeView({ w1: makeWidget('w1', 'svg-ext-gauge') });
    render(<RuntimeCanvas view={view} viewId="v1" reactorId="F01" />);
    expect(capturedOnReplaceCallback.fn).not.toBeNull();
    await act(async () => {
      capturedOnReplaceCallback.fn!(makeReplaceEvent('svg-ext-gauge'));
    });
    expect(mockOldGauge.onUnmount).toHaveBeenCalledOnce();
  });

  it('T4: onReplace fire → 新 gauge.onMount 被调用', async () => {
    const view = makeView({ w1: makeWidget('w1', 'svg-ext-gauge') });
    render(<RuntimeCanvas view={view} viewId="v1" reactorId="F01" />);
    await act(async () => {
      capturedOnReplaceCallback.fn!(makeReplaceEvent('svg-ext-gauge'));
    });
    // newMeta.create() 在 makeReplaceEvent 中返回 mockNewGauge
    expect(mockNewGauge.onMount).toHaveBeenCalledOnce();
  });

  it('T5: type 不匹配的 widget 不受 onReplace 影响', async () => {
    const mockValveGauge = { onMount: vi.fn(), onUnmount: vi.fn(), onProcess: vi.fn() };
    (gaugeRegistry.create as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(() => mockOldGauge)   // w1: svg-ext-gauge
      .mockImplementationOnce(() => mockValveGauge); // w2: svg-ext-valve

    const view = makeView({
      w1: makeWidget('w1', 'svg-ext-gauge'),
      w2: makeWidget('w2', 'svg-ext-valve'),
    });
    render(<RuntimeCanvas view={view} viewId="v1" reactorId="F01" />);
    await act(async () => {
      // 只 replace gauge type，不影响 valve
      capturedOnReplaceCallback.fn!(makeReplaceEvent('svg-ext-gauge'));
    });
    expect(mockValveGauge.onUnmount).not.toHaveBeenCalled();
  });

  it('T6: unmount → onReplace 订阅取消 (unsubscribe called)', () => {
    const view = makeView({ w1: makeWidget('w1', 'svg-ext-gauge') });
    const { unmount } = render(<RuntimeCanvas view={view} viewId="v1" reactorId="F01" />);
    unmount();
    expect(mockOnReplaceUnsub).toHaveBeenCalled();
  });
});
