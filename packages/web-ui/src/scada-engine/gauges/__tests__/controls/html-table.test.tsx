import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { htmlTableMeta } from '../../controls/html-table';
import type { GaugeContext } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({ render: vi.fn(), unmount: vi.fn() })),
}));

const makeGroup = () => document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
const makeWidget = (property?: Record<string, unknown>): FuxaWidget => ({
  id: 't1', type: 'svg-ext-own_ctrl-table',
  property: property ?? { options: { rows: [{ cells: [{ type: 'label', value: 'DO' }, { type: 'variable', variableId: 'reactor1.AI-0' }] }] } },
  x: 0, y: 0, w: 200, h: 150,
});
const makeCtx = (overrides?: Partial<GaugeContext>): GaugeContext => ({
  parentGroup: makeGroup(),
  readValue: vi.fn().mockReturnValue({ value: 8.5, isStale: false }),
  canvasSize: { width: 800, height: 600 },
  mode: 'editor',
  ...overrides,
});

describe('HtmlTableGauge (svg-ext-own_ctrl-table)', () => {
  it('onMount creates <foreignObject> with <div> mount point in parentGroup', () => {
    const ctx = makeCtx();
    htmlTableMeta.create().onMount(makeWidget(), ctx);
    expect(ctx.parentGroup.querySelector('foreignObject')).not.toBeNull();
    expect(ctx.parentGroup.querySelector('foreignObject div')).not.toBeNull();
  });

  it('onMount calls createRoot and render', async () => {
    const { createRoot } = await import('react-dom/client');
    const mockRoot = { render: vi.fn(), unmount: vi.fn() };
    (createRoot as any).mockReturnValue(mockRoot);
    const ctx = makeCtx();
    htmlTableMeta.create().onMount(makeWidget(), ctx);
    expect(mockRoot.render).toHaveBeenCalled();
  });

  it('onProcess updates cellValues and calls root.render', async () => {
    const { createRoot } = await import('react-dom/client');
    const mockRoot = { render: vi.fn(), unmount: vi.fn() };
    (createRoot as any).mockReturnValue(mockRoot);
    const ctx = makeCtx();
    const g = htmlTableMeta.create();
    g.onMount(makeWidget(), ctx);
    const before = mockRoot.render.mock.calls.length;
    g.onProcess({ value: 9.1, isStale: false });
    expect(mockRoot.render.mock.calls.length).toBeGreaterThan(before);
  });

  it('getSignals extracts variableIds from rows[].cells[].variableId', () => {
    expect(htmlTableMeta.getSignals(makeWidget())).toContain('reactor1.AI-0');
  });

  it('onUnmount calls root.unmount and removes <foreignObject>', async () => {
    const { createRoot } = await import('react-dom/client');
    const mockRoot = { render: vi.fn(), unmount: vi.fn() };
    (createRoot as any).mockReturnValue(mockRoot);
    const ctx = makeCtx();
    const g = htmlTableMeta.create();
    g.onMount(makeWidget(), ctx);
    g.onUnmount();
    expect(mockRoot.unmount).toHaveBeenCalled();
    expect(ctx.parentGroup.querySelector('foreignObject')).toBeNull();
  });
});
