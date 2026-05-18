import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { htmlChartMeta } from '../../controls/html-chart';
import type { GaugeContext } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

vi.mock('uplot', () => {
  const ctor = vi.fn().mockImplementation(() => ({ setData: vi.fn(), setSize: vi.fn(), destroy: vi.fn() }));
  return { default: ctor };
});

vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({ render: vi.fn(), unmount: vi.fn() })),
}));

const makeGroup = () => document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
const makeWidget = (property?: Record<string, unknown>): FuxaWidget => ({
  id: 'c1', type: 'svg-ext-html_chart', property: property ?? { variableIds: ['reactor1.AI-0'] },
  x: 0, y: 0, w: 300, h: 200,
});
const makeCtx = (overrides?: Partial<GaugeContext>): GaugeContext => ({
  parentGroup: makeGroup(),
  readValue: vi.fn().mockReturnValue({ value: 1.5, isStale: false }),
  canvasSize: { width: 800, height: 600 },
  mode: 'editor',
  ...overrides,
});

describe('HtmlChartGauge (svg-ext-html_chart)', () => {
  it('onMount creates <foreignObject> with <div> mount point in parentGroup', () => {
    const ctx = makeCtx();
    htmlChartMeta.create().onMount(makeWidget(), ctx);
    expect(ctx.parentGroup.querySelector('foreignObject')).not.toBeNull();
    expect(ctx.parentGroup.querySelector('foreignObject div')).not.toBeNull();
  });

  it('onMount calls createRoot on the mount div', async () => {
    const { createRoot } = await import('react-dom/client');
    const ctx = makeCtx();
    htmlChartMeta.create().onMount(makeWidget(), ctx);
    expect(createRoot).toHaveBeenCalled();
  });

  it('onProcess appends value to buffer and calls root.render', async () => {
    const { createRoot } = await import('react-dom/client');
    const mockRoot = { render: vi.fn(), unmount: vi.fn() };
    (createRoot as any).mockReturnValue(mockRoot);
    const ctx = makeCtx();
    const g = htmlChartMeta.create();
    g.onMount(makeWidget(), ctx);
    const before = mockRoot.render.mock.calls.length;
    g.onProcess({ value: 3.14, isStale: false });
    expect(mockRoot.render.mock.calls.length).toBeGreaterThan(before);
  });

  it('onPropertyChange calls root.render with updated props', async () => {
    const { createRoot } = await import('react-dom/client');
    const mockRoot = { render: vi.fn(), unmount: vi.fn() };
    (createRoot as any).mockReturnValue(mockRoot);
    const ctx = makeCtx();
    const g = htmlChartMeta.create();
    const widget = makeWidget({ title: '旧', variableIds: [] });
    g.onMount(widget, ctx);
    g.onPropertyChange({ key: 'title', value: '新', nextWidget: { ...widget, property: { ...widget.property, title: '新' } as any } });
    expect(mockRoot.render).toHaveBeenCalled();
  });

  it('onUnmount calls root.unmount and removes <foreignObject>', async () => {
    const { createRoot } = await import('react-dom/client');
    const mockRoot = { render: vi.fn(), unmount: vi.fn() };
    (createRoot as any).mockReturnValue(mockRoot);
    const ctx = makeCtx();
    const g = htmlChartMeta.create();
    g.onMount(makeWidget(), ctx);
    g.onUnmount();
    expect(mockRoot.unmount).toHaveBeenCalled();
    expect(ctx.parentGroup.querySelector('foreignObject')).toBeNull();
  });
});
