// SP-FX-25: RuntimeCanvas touch gesture (pinch-to-zoom + pan) tests
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// Mock CanvasController (no SVG in jsdom)
vi.mock('../../editor/canvas-svg', () => ({
  CanvasController: class {
    root = { node: document.createElementNS('http://www.w3.org/2000/svg', 'svg') };
    widgetLayer = { node: document.createElementNS('http://www.w3.org/2000/svg', 'g') };
    loadView = vi.fn();
    destroy = vi.fn();
  },
}));

vi.mock('../../gauges/gauge-registry', () => ({
  gaugeRegistry: { create: () => null, getSignals: () => [], onReplace: () => () => {} },
}));

vi.mock('../../services/tag-binding-bridge', () => ({
  bindGaugesToRealtime: () => vi.fn(),
}));

vi.mock('../../services/animation-engine', () => ({
  resolveAnimations: () => [],
  evalAnimations: () => [],
}));

vi.mock('@/stores/realtime-store', () => ({
  useRealtimeStore: Object.assign(
    (selector: (s: any) => any) => selector({ reactorData: {} }),
    { subscribe: vi.fn(() => vi.fn()) },
  ),
}));

vi.mock('@/components/scada/runtime/WriteIntentDialog', () => ({
  WriteIntentDialog: () => null,
}));

vi.mock('../../gauges/controls/index', () => ({}));

import { RuntimeCanvas } from '../RuntimeCanvas';
import type { FuxaView } from '../../models';

const MOCK_VIEW: FuxaView = {
  id: 'v1', name: 'Test', type: 'svg', svgcontent: '<svg/>',
  width: 800, height: 600, items: {}, schemaVersion: 1,
} as any;

describe('RuntimeCanvas touch gesture (SP-FX-25)', () => {
  it('gesture wrapper 存在 (data-testid="runtime-gesture-wrapper")', () => {
    const { getByTestId } = render(
      <RuntimeCanvas view={MOCK_VIEW} viewId="v1" reactorId="r1" />
    );
    expect(getByTestId('runtime-gesture-wrapper')).toBeTruthy();
  });

  it('touch container 存在 (data-testid="runtime-touch-container")', () => {
    const { getByTestId } = render(
      <RuntimeCanvas view={MOCK_VIEW} viewId="v1" reactorId="r1" />
    );
    expect(getByTestId('runtime-touch-container')).toBeTruthy();
  });

  it('touch-container 初始 transform 含 translate(0px, 0px) scale(1)', () => {
    const { getByTestId } = render(
      <RuntimeCanvas view={MOCK_VIEW} viewId="v1" reactorId="r1" />
    );
    const container = getByTestId('runtime-touch-container');
    const style = (container as HTMLElement).style.transform;
    expect(style).toContain('translate(0px, 0px)');
    expect(style).toContain('scale(1)');
  });

  it('touch-container 含 touch-none class (防止浏览器默认 touch 行为)', () => {
    const { getByTestId } = render(
      <RuntimeCanvas view={MOCK_VIEW} viewId="v1" reactorId="r1" />
    );
    const container = getByTestId('runtime-touch-container');
    expect((container as HTMLElement).className).toContain('touch-none');
  });

  it('gesture wrapper 含 overflow-hidden class', () => {
    const { getByTestId } = render(
      <RuntimeCanvas view={MOCK_VIEW} viewId="v1" reactorId="r1" />
    );
    const wrapper = getByTestId('runtime-gesture-wrapper');
    expect((wrapper as HTMLElement).className).toContain('overflow-hidden');
  });
});
