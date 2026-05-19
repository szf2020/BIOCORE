// SP-FX-9 T3: RED tests for HtmlGraphGauge (native canvas trend line).
// foreignObject + HTMLCanvasElement, ZERO third-party dep.
import { describe, it, expect, vi } from 'vitest';
import type { GaugeContext } from '../../../gauge-base';
import type { FuxaWidget } from '../../../../models';

const makeWidget = (overrides: Partial<FuxaWidget> = {}): FuxaWidget => ({
  id: 'w-graph1',
  type: 'svg-ext-html_graph',
  x: 0,
  y: 0,
  w: 200,
  h: 100,
  property: {
    variableId: 'r1.AI-0',
    maxPoints: 10,
    lineColor: '#3b82f6',
    bgColor: '#1e293b',
    minVal: 0,
    maxVal: 100,
  },
  ...overrides,
} as unknown as FuxaWidget);

const makeCtx = (): GaugeContext => ({
  parentGroup: document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement,
  readValue: vi.fn().mockReturnValue({ value: 0, isStale: false }),
  canvasSize: { width: 800, height: 600 },
  mode: 'editor',
});

describe('HtmlGraphGauge', () => {
  it('onMount creates foreignObject with data-widget-id containing a canvas element', async () => {
    const { htmlGraphMeta } = await import('../../../controls/batch3/html-graph');
    const ctx = makeCtx();
    const gauge = htmlGraphMeta.create();
    gauge.onMount(makeWidget(), ctx);
    const fo = ctx.parentGroup.querySelector('foreignObject');
    expect(fo).toBeTruthy();
    expect(fo?.getAttribute('data-widget-id')).toBe('w-graph1');
    const canvas = fo?.querySelector('canvas');
    expect(canvas).toBeTruthy();
  });

  it('onProcess pushes a value into the internal buffer (data-point-count attribute updates)', async () => {
    const { htmlGraphMeta } = await import('../../../controls/batch3/html-graph');
    const ctx = makeCtx();
    const gauge = htmlGraphMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: 50, isStale: false });
    const canvas = ctx.parentGroup.querySelector('canvas') as HTMLCanvasElement | null;
    expect(canvas?.dataset['pointCount']).toBe('1');
  });

  it('onProcess with maxPoints=3: after 4 pushes, buffer stays at 3', async () => {
    const { htmlGraphMeta } = await import('../../../controls/batch3/html-graph');
    const ctx = makeCtx();
    const gauge = htmlGraphMeta.create();
    gauge.onMount(makeWidget({ property: { variableId: 'r1.AI-0', maxPoints: 3, minVal: 0, maxVal: 100 } } as any), ctx);
    gauge.onProcess({ value: 10, isStale: false });
    gauge.onProcess({ value: 20, isStale: false });
    gauge.onProcess({ value: 30, isStale: false });
    gauge.onProcess({ value: 40, isStale: false });
    const canvas = ctx.parentGroup.querySelector('canvas') as HTMLCanvasElement | null;
    expect(canvas?.dataset['pointCount']).toBe('3');
  });

  it('onProcess with isStale=true does not push to buffer', async () => {
    const { htmlGraphMeta } = await import('../../../controls/batch3/html-graph');
    const ctx = makeCtx();
    const gauge = htmlGraphMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: null, isStale: true });
    const canvas = ctx.parentGroup.querySelector('canvas') as HTMLCanvasElement | null;
    expect(canvas?.dataset['pointCount']).toBe('0');
  });

  it('onUnmount removes foreignObject and clears buffer', async () => {
    const { htmlGraphMeta } = await import('../../../controls/batch3/html-graph');
    const ctx = makeCtx();
    const gauge = htmlGraphMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: 50, isStale: false });
    gauge.onUnmount();
    expect(ctx.parentGroup.childElementCount).toBe(0);
    expect(() => gauge.onUnmount()).not.toThrow();
  });

  // SP-FX-48.19 phase 2: chartType=bar renders bars (smoke test — no canvas pixel
  // assertions in jsdom, just verify no throw + buffer still updates).
  it('chartType=bar updates buffer count same as line variant', async () => {
    const { htmlGraphMeta } = await import('../../../controls/batch3/html-graph');
    const ctx = makeCtx();
    const gauge = htmlGraphMeta.create();
    gauge.onMount(makeWidget({ property: { variableId: 'r1.AI-0', chartType: 'bar', maxPoints: 5, minVal: 0, maxVal: 100 } } as any), ctx);
    gauge.onProcess({ value: 10, isStale: false });
    gauge.onProcess({ value: 30, isStale: false });
    gauge.onProcess({ value: 60, isStale: false });
    const canvas = ctx.parentGroup.querySelector('canvas') as HTMLCanvasElement | null;
    expect(canvas?.dataset['pointCount']).toBe('3');
  });

  it('chartType=bar single sample does not throw (line needs 2 points minimum)', async () => {
    const { htmlGraphMeta } = await import('../../../controls/batch3/html-graph');
    const ctx = makeCtx();
    const gauge = htmlGraphMeta.create();
    gauge.onMount(makeWidget({ property: { variableId: 'r1.AI-0', chartType: 'bar', maxPoints: 5 } } as any), ctx);
    expect(() => gauge.onProcess({ value: 42, isStale: false })).not.toThrow();
  });
});
