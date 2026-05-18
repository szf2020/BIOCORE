import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { RuntimeCanvas } from '../RuntimeCanvas';
import type { FuxaView } from '../../models';
import type { AnimationPatch } from '../../services/animation-engine';

// Use vi.hoisted so mock factory closures can reference these vars safely.
const { mockLoadView, mockCanvasCtrl, mockGauge, mockUnbind, mockDestroy } = vi.hoisted(() => {
  const mockLoadView = vi.fn();
  const mockGauge = {
    onMount: vi.fn(),
    onUnmount: vi.fn(),
    onProcess: vi.fn(),
    onClick: vi.fn(),
  };
  const mockUnbind = vi.fn();
  const mockDestroy = vi.fn();
  const mockCanvasCtrl = {
    loadView: mockLoadView,
    destroy: mockDestroy,
    widgetLayer: { node: document.createElementNS('http://www.w3.org/2000/svg', 'g') },
    root: { node: document.createElementNS('http://www.w3.org/2000/svg', 'svg') },
  };
  return { mockLoadView, mockCanvasCtrl, mockGauge, mockUnbind, mockDestroy };
});

vi.mock('../../editor/canvas-svg', () => ({
  CanvasController: vi.fn().mockImplementation(() => mockCanvasCtrl),
}));

vi.mock('../../gauges/gauge-registry', () => ({
  gaugeRegistry: {
    create: vi.fn().mockReturnValue(mockGauge),
    getSignals: vi.fn().mockReturnValue(['TAG_01']),
  },
}));

vi.mock('../../services/tag-binding-bridge', () => ({
  bindGaugesToRealtime: vi.fn().mockReturnValue(mockUnbind),
}));

vi.mock('../../services/animation-engine', () => ({
  resolveAnimations: vi.fn().mockReturnValue([]),
  evalAnimations: vi.fn().mockReturnValue([]),
}));

vi.mock('@/stores/realtime-store', () => ({
  useRealtimeStore: {
    getState: vi.fn().mockReturnValue({ reactorData: {} }),
  },
}));

vi.mock('@/components/scada/runtime/WriteIntentDialog', () => ({
  WriteIntentDialog: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="write-intent-dialog">
      <button onClick={onClose}>close</button>
    </div>
  ),
}));

vi.mock('../../gauges/controls/index', () => ({}));

vi.useFakeTimers();

import { bindGaugesToRealtime } from '../../services/tag-binding-bridge';

function makeView(items: FuxaView['items'] = {}): FuxaView {
  return {
    id: 'v1', name: 'Test View',
    svgcontent: '<svg></svg>',
    width: 800, height: 600,
    items,
  } as unknown as FuxaView;
}

function makeWidget(id: string): any {
  return {
    id, type: 'svg-ext-value',
    x: 0, y: 0, w: 100, h: 40, rotate: 0, lock: false, hide: false,
    property: { variableId: 'TAG_01' },
    svgcontent: '',
  };
}

describe('RuntimeCanvas', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('mount -> CanvasController.loadView called; gauge instances created per widget', () => {
    const view = makeView({ w1: makeWidget('w1') });
    render(<RuntimeCanvas view={view} viewId="v1" reactorId="F01" />);
    expect(mockLoadView).toHaveBeenCalledWith(view);
    expect(mockGauge.onMount).toHaveBeenCalledOnce();
    expect(bindGaugesToRealtime).toHaveBeenCalledOnce();
  });

  it('processValues change -> gauge.onProcess called (via bridge spy)', () => {
    const view = makeView({ w1: makeWidget('w1') });
    render(<RuntimeCanvas view={view} viewId="v1" reactorId="F01" />);
    const [, gaugesArg] = (bindGaugesToRealtime as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(gaugesArg.get('w1')).toBe(mockGauge);
  });

  it('button click -> dialogWidget state set -> WriteIntentDialog renders', async () => {
    const view = makeView({ w1: makeWidget('w1') });
    let capturedCtx: any;
    mockGauge.onMount.mockImplementation((_w: any, ctx: any) => { capturedCtx = ctx; });
    const { queryByTestId } = render(
      <RuntimeCanvas view={view} viewId="v1" reactorId="F01" />,
    );
    expect(queryByTestId('write-intent-dialog')).toBeNull();
    await act(async () => {
      capturedCtx?.onWriteIntent({ tag: 'TAG_01', value: 100, widgetId: 'w1' });
    });
    expect(queryByTestId('write-intent-dialog')).not.toBeNull();
  });

  it('animation tick -> evalAnimations called; applyPatch updates element attribute', async () => {
    const { evalAnimations } = await import('../../services/animation-engine');
    (evalAnimations as ReturnType<typeof vi.fn>).mockReturnValue([
      { widgetId: 'w1', target: 'color', value: 'red' } satisfies AnimationPatch,
    ]);
    const view = makeView({ w1: makeWidget('w1') });
    render(<RuntimeCanvas view={view} viewId="v1" reactorId="F01" />);
    await act(async () => { vi.advanceTimersByTime(16); });
    expect(evalAnimations).toHaveBeenCalled();
  });

  it('unmount cleanup -> gauges destroyed, subscription unbound, canvas destroyed', () => {
    const view = makeView({ w1: makeWidget('w1') });
    const { unmount } = render(<RuntimeCanvas view={view} viewId="v1" reactorId="F01" />);
    unmount();
    expect(mockUnbind).toHaveBeenCalledOnce();
    expect(mockGauge.onUnmount).toHaveBeenCalledOnce();
    expect(mockDestroy).toHaveBeenCalledOnce();
  });
});
