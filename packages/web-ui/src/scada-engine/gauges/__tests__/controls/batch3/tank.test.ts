// SP-FX-9 T5: RED tests for TankGauge (SVG liquid level tank).
// Pure SVG rect + data-fill rect, bottom-up level fill.
import { describe, it, expect, vi } from 'vitest';
import type { GaugeContext } from '../../../gauge-base';
import type { FuxaWidget } from '../../../../models';

const makeWidget = (overrides: Partial<FuxaWidget> = {}): FuxaWidget => ({
  id: 'w-tank1',
  type: 'svg-ext-tank',
  x: 0,
  y: 0,
  w: 60,
  h: 100,
  property: {
    variableId: 'r1.LI-0',
    min: 0,
    max: 100,
    fillColor: '#3b82f6',
    bgColor: '#e2e8f0',
    showLabel: true,
  },
  ...overrides,
} as unknown as FuxaWidget);

const makeCtx = (): GaugeContext => ({
  parentGroup: document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement,
  readValue: vi.fn().mockReturnValue({ value: 0, isStale: false }),
  canvasSize: { width: 800, height: 600 },
  mode: 'editor',
});

describe('TankGauge', () => {
  it('onMount creates background rect + fill rect with data-widget-id', async () => {
    const { tankMeta } = await import('../../../controls/batch3/tank');
    const ctx = makeCtx();
    const gauge = tankMeta.create();
    gauge.onMount(makeWidget(), ctx);
    const rects = ctx.parentGroup.querySelectorAll('rect');
    expect(rects.length).toBeGreaterThanOrEqual(2);
    const tagged = ctx.parentGroup.querySelector('[data-widget-id="w-tank1"]');
    expect(tagged).toBeTruthy();
    const fillRect = ctx.parentGroup.querySelector('[data-fill="true"]');
    expect(fillRect).toBeTruthy();
  });

  it('onProcess with value=50 fills approximately 50% of height from bottom', async () => {
    const { tankMeta } = await import('../../../controls/batch3/tank');
    const ctx = makeCtx();
    const gauge = tankMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: 50, isStale: false });
    const fillRect = ctx.parentGroup.querySelector('[data-fill="true"]') as SVGRectElement | null;
    const fillHeight = parseFloat(fillRect?.getAttribute('height') ?? '0');
    expect(fillHeight).toBeCloseTo(50, 0);
  });

  it('onProcess with value=0 sets fill height to 0', async () => {
    const { tankMeta } = await import('../../../controls/batch3/tank');
    const ctx = makeCtx();
    const gauge = tankMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: 0, isStale: false });
    const fillRect = ctx.parentGroup.querySelector('[data-fill="true"]') as SVGRectElement | null;
    const fillHeight = parseFloat(fillRect?.getAttribute('height') ?? '-1');
    expect(fillHeight).toBeCloseTo(0, 0);
  });

  it('onProcess with isStale=true sets fill height to 0', async () => {
    const { tankMeta } = await import('../../../controls/batch3/tank');
    const ctx = makeCtx();
    const gauge = tankMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: 80, isStale: false });
    gauge.onProcess({ value: null, isStale: true });
    const fillRect = ctx.parentGroup.querySelector('[data-fill="true"]') as SVGRectElement | null;
    const fillHeight = parseFloat(fillRect?.getAttribute('height') ?? '-1');
    expect(fillHeight).toBeCloseTo(0, 0);
  });

  it('onUnmount removes all elements and is idempotent', async () => {
    const { tankMeta } = await import('../../../controls/batch3/tank');
    const ctx = makeCtx();
    const gauge = tankMeta.create();
    gauge.onMount(makeWidget(), ctx);
    expect(ctx.parentGroup.childElementCount).toBeGreaterThanOrEqual(2);
    gauge.onUnmount();
    expect(ctx.parentGroup.childElementCount).toBe(0);
    expect(() => gauge.onUnmount()).not.toThrow();
  });
});
