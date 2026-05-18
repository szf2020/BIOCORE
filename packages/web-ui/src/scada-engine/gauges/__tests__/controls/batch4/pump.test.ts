// SP-FX-10 T7: RED tests for PumpGauge (SVG pump with blade state indicator).
// Outer circle (pump casing) + N blade segments [data-blade], multi-state color switching.
import { describe, it, expect, vi } from 'vitest';
import type { GaugeContext } from '../../../gauge-base';
import type { FuxaWidget } from '../../../../models';

const makeWidget = (overrides: Partial<FuxaWidget> = {}): FuxaWidget => ({
  id: 'w-pump1',
  type: 'svg-ext-pump',
  x: 0,
  y: 0,
  w: 60,
  h: 60,
  property: {
    variableId: 'r1.pump-state',
    states: [
      { value: '1', color: '#22c55e' },
      { value: '2', color: '#f59e0b' },
    ],
    defaultColor: '#9ca3af',
    bladeCount: 3,
  },
  ...overrides,
} as unknown as FuxaWidget);

const makeCtx = (): GaugeContext => ({
  parentGroup: document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement,
  readValue: vi.fn().mockReturnValue({ value: '0', isStale: false }),
  canvasSize: { width: 800, height: 600 },
  mode: 'editor',
});

describe('PumpGauge', () => {
  it('onMount creates outer circle [data-widget-id] + bladeCount blade elements [data-blade]', async () => {
    const { pumpMeta } = await import('../../../controls/batch4/pump');
    const ctx = makeCtx();
    const gauge = pumpMeta.create();
    gauge.onMount(makeWidget(), ctx);
    const outerCircle = ctx.parentGroup.querySelector('[data-widget-id="w-pump1"]');
    expect(outerCircle).toBeTruthy();
    const blades = ctx.parentGroup.querySelectorAll('[data-blade]');
    expect(blades.length).toBe(3);
  });

  it('onProcess with matched state value sets all blades fill to state color', async () => {
    const { pumpMeta } = await import('../../../controls/batch4/pump');
    const ctx = makeCtx();
    const gauge = pumpMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: '1', isStale: false });
    const blades = ctx.parentGroup.querySelectorAll('[data-blade]');
    blades.forEach(blade => {
      expect((blade as SVGElement).getAttribute('fill')).toBe('#22c55e');
    });
  });

  it('onProcess with isStale=true sets all blades fill to defaultColor', async () => {
    const { pumpMeta } = await import('../../../controls/batch4/pump');
    const ctx = makeCtx();
    const gauge = pumpMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: '1', isStale: false });
    gauge.onProcess({ value: null, isStale: true });
    const blades = ctx.parentGroup.querySelectorAll('[data-blade]');
    blades.forEach(blade => {
      expect((blade as SVGElement).getAttribute('fill')).toBe('#9ca3af');
    });
  });

  it('onResize does not throw when outer circle exists', async () => {
    const { pumpMeta } = await import('../../../controls/batch4/pump');
    const ctx = makeCtx();
    const gauge = pumpMeta.create();
    gauge.onMount(makeWidget(), ctx);
    expect(() => gauge.onResize(80, 80)).not.toThrow();
  });

  it('onUnmount removes all elements and is idempotent', async () => {
    const { pumpMeta } = await import('../../../controls/batch4/pump');
    const ctx = makeCtx();
    const gauge = pumpMeta.create();
    gauge.onMount(makeWidget(), ctx);
    expect(ctx.parentGroup.childElementCount).toBeGreaterThanOrEqual(2);
    gauge.onUnmount();
    expect(ctx.parentGroup.childElementCount).toBe(0);
    expect(() => gauge.onUnmount()).not.toThrow();
  });
});
