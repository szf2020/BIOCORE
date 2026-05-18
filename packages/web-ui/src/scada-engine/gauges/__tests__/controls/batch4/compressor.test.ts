// SP-FX-10 T3: RED tests for CompressorGauge (SVG state indicator).
// Outer ellipse (body) + inner ellipse (state indicator), multi-state color switching.
import { describe, it, expect, vi } from 'vitest';
import type { GaugeContext } from '../../../gauge-base';
import type { FuxaWidget } from '../../../../models';

const makeWidget = (overrides: Partial<FuxaWidget> = {}): FuxaWidget => ({
  id: 'w-comp1',
  type: 'svg-ext-compressor',
  x: 0,
  y: 0,
  w: 60,
  h: 40,
  property: {
    variableId: 'r1.AI-comp',
    states: [
      { value: '1', color: '#22c55e', label: '运行' },
      { value: '2', color: '#ef4444', label: '故障' },
    ],
    defaultColor: '#9ca3af',
    bodyColor: '#475569',
  },
  ...overrides,
} as unknown as FuxaWidget);

const makeCtx = (): GaugeContext => ({
  parentGroup: document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement,
  readValue: vi.fn().mockReturnValue({ value: '0', isStale: false }),
  canvasSize: { width: 800, height: 600 },
  mode: 'editor',
});

describe('CompressorGauge', () => {
  it('onMount creates outer ellipse [data-widget-id] + inner ellipse [data-state-indicator]', async () => {
    const { compressorMeta } = await import('../../../controls/batch4/compressor');
    const ctx = makeCtx();
    const gauge = compressorMeta.create();
    gauge.onMount(makeWidget(), ctx);
    const outerEl = ctx.parentGroup.querySelector('[data-widget-id="w-comp1"]');
    expect(outerEl).toBeTruthy();
    expect(outerEl?.tagName.toLowerCase()).toBe('ellipse');
    const innerEl = ctx.parentGroup.querySelector('[data-state-indicator="true"]');
    expect(innerEl).toBeTruthy();
    expect(innerEl?.tagName.toLowerCase()).toBe('ellipse');
  });

  it('onProcess with matched state value sets inner ellipse fill to state color', async () => {
    const { compressorMeta } = await import('../../../controls/batch4/compressor');
    const ctx = makeCtx();
    const gauge = compressorMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: '1', isStale: false });
    const innerEl = ctx.parentGroup.querySelector('[data-state-indicator="true"]') as SVGEllipseElement | null;
    expect(innerEl?.getAttribute('fill')).toBe('#22c55e');
  });

  it('onProcess with no matching state uses defaultColor', async () => {
    const { compressorMeta } = await import('../../../controls/batch4/compressor');
    const ctx = makeCtx();
    const gauge = compressorMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: '99', isStale: false });
    const innerEl = ctx.parentGroup.querySelector('[data-state-indicator="true"]') as SVGEllipseElement | null;
    expect(innerEl?.getAttribute('fill')).toBe('#9ca3af');
  });

  it('onProcess with isStale=true sets inner ellipse fill to stale gray #9ca3af', async () => {
    const { compressorMeta } = await import('../../../controls/batch4/compressor');
    const ctx = makeCtx();
    const gauge = compressorMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: '1', isStale: false });
    gauge.onProcess({ value: null, isStale: true });
    const innerEl = ctx.parentGroup.querySelector('[data-state-indicator="true"]') as SVGEllipseElement | null;
    expect(innerEl?.getAttribute('fill')).toBe('#9ca3af');
  });

  it('onUnmount removes all elements and is idempotent', async () => {
    const { compressorMeta } = await import('../../../controls/batch4/compressor');
    const ctx = makeCtx();
    const gauge = compressorMeta.create();
    gauge.onMount(makeWidget(), ctx);
    expect(ctx.parentGroup.childElementCount).toBeGreaterThanOrEqual(2);
    gauge.onUnmount();
    expect(ctx.parentGroup.childElementCount).toBe(0);
    expect(() => gauge.onUnmount()).not.toThrow();
  });
});
