// SP-FX-6.2 T3: RED tests for GaugeProgress — run BEFORE impl exists.
import { describe, it, expect, vi } from 'vitest';
import type { GaugeContext } from '../../../gauge-base';
import type { FuxaWidget } from '../../../../models';

const makeWidget = (overrides: Partial<FuxaWidget> = {}): FuxaWidget => ({
  id: 'w2',
  type: 'svg-ext-gauge_progress',
  x: 0,
  y: 0,
  w: 40,
  h: 100,
  property: {
    variableId: 'r1.AI-1',
    min: 0,
    max: 100,
    barColor: '#3F4964',
    showLabel: false,
  },
  ...overrides,
} as unknown as FuxaWidget);

const makeCtx = (): GaugeContext => ({
  parentGroup: document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement,
  readValue: vi.fn().mockReturnValue({ value: 0, isStale: false }),
  canvasSize: { width: 800, height: 600 },
  mode: 'editor',
});

describe('GaugeProgress', () => {
  it('onMount creates background rect + bar rect with data-widget-id', async () => {
    const { gaugeProgressMeta } = await import(
      '../../../controls/batch2/gauge-progress'
    );
    const ctx = makeCtx();
    const gauge = gaugeProgressMeta.create();
    gauge.onMount(makeWidget(), ctx);
    const rects = ctx.parentGroup.querySelectorAll('rect');
    expect(rects.length).toBeGreaterThanOrEqual(2);
    const tagged = ctx.parentGroup.querySelector('[data-widget-id="w2"]');
    expect(tagged).toBeTruthy();
  });

  it('onProcess with value=50 sets bar height to ~50% of total height', async () => {
    const { gaugeProgressMeta } = await import(
      '../../../controls/batch2/gauge-progress'
    );
    const ctx = makeCtx();
    const gauge = gaugeProgressMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: 50, isStale: false });
    const bar = ctx.parentGroup.querySelector('[data-bar="true"]') as SVGRectElement | null;
    expect(bar).toBeTruthy();
    const barHeight = parseFloat(bar!.getAttribute('height') ?? '0');
    expect(barHeight).toBeCloseTo(50, 0);
  });

  it('onProcess with value=0 sets bar height to 0', async () => {
    const { gaugeProgressMeta } = await import(
      '../../../controls/batch2/gauge-progress'
    );
    const ctx = makeCtx();
    const gauge = gaugeProgressMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: 0, isStale: false });
    const bar = ctx.parentGroup.querySelector('[data-bar="true"]') as SVGRectElement | null;
    expect(bar).toBeTruthy();
    const barHeight = parseFloat(bar!.getAttribute('height') ?? '-1');
    expect(barHeight).toBeCloseTo(0, 0);
  });

  it('onPropertyChange updates bar fill color', async () => {
    const { gaugeProgressMeta } = await import(
      '../../../controls/batch2/gauge-progress'
    );
    const ctx = makeCtx();
    const gauge = gaugeProgressMeta.create();
    gauge.onMount(makeWidget(), ctx);
    const nextWidget = makeWidget({
      property: { variableId: 'r1.AI-1', min: 0, max: 100, barColor: '#ff0000', showLabel: false },
    } as Partial<FuxaWidget>);
    gauge.onPropertyChange({ key: 'barColor', value: '#ff0000', nextWidget });
    const bar = ctx.parentGroup.querySelector('[data-bar="true"]') as SVGRectElement | null;
    expect(bar?.getAttribute('fill')).toBe('#ff0000');
  });

  it('onUnmount removes all elements and is idempotent', async () => {
    const { gaugeProgressMeta } = await import(
      '../../../controls/batch2/gauge-progress'
    );
    const ctx = makeCtx();
    const gauge = gaugeProgressMeta.create();
    gauge.onMount(makeWidget(), ctx);
    expect(ctx.parentGroup.childElementCount).toBeGreaterThanOrEqual(2);
    gauge.onUnmount();
    expect(ctx.parentGroup.childElementCount).toBe(0);
    expect(() => gauge.onUnmount()).not.toThrow();
  });
});
