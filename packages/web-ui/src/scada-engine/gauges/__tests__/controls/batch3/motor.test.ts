// SP-FX-9 T7: RED tests for MotorGauge (SVG motor state indicator).
// Pure SVG circle, multi-state color switching.
import { describe, it, expect, vi } from 'vitest';
import type { GaugeContext } from '../../../gauge-base';
import type { FuxaWidget } from '../../../../models';

const makeWidget = (overrides: Partial<FuxaWidget> = {}): FuxaWidget => ({
  id: 'w-motor1',
  type: 'svg-ext-motor',
  x: 10,
  y: 10,
  w: 50,
  h: 50,
  property: {
    variableId: 'r1.MOTOR-0',
    states: [
      { value: '0', color: '#6b7280', label: 'STOP' },
      { value: '1', color: '#22c55e', label: 'RUN' },
      { value: '2', color: '#ef4444', label: 'FAULT' },
    ],
    defaultColor: '#9ca3af',
  },
  ...overrides,
} as unknown as FuxaWidget);

const makeCtx = (): GaugeContext => ({
  parentGroup: document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement,
  readValue: vi.fn().mockReturnValue({ value: '0', isStale: false }),
  canvasSize: { width: 800, height: 600 },
  mode: 'editor',
});

describe('MotorGauge', () => {
  it('onMount creates a circle with data-widget-id in parentGroup', async () => {
    const { motorMeta } = await import('../../../controls/batch3/motor');
    const ctx = makeCtx();
    const gauge = motorMeta.create();
    gauge.onMount(makeWidget(), ctx);
    const circle = ctx.parentGroup.querySelector('circle[data-widget-id="w-motor1"]');
    expect(circle).toBeTruthy();
  });

  it('onProcess with value "1" matches RUN state and sets fill to #22c55e', async () => {
    const { motorMeta } = await import('../../../controls/batch3/motor');
    const ctx = makeCtx();
    const gauge = motorMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: '1', isStale: false });
    const circle = ctx.parentGroup.querySelector('circle') as SVGCircleElement | null;
    expect(circle?.getAttribute('fill')).toBe('#22c55e');
  });

  it('onProcess with value "99" (no match) sets fill to defaultColor', async () => {
    const { motorMeta } = await import('../../../controls/batch3/motor');
    const ctx = makeCtx();
    const gauge = motorMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: '99', isStale: false });
    const circle = ctx.parentGroup.querySelector('circle') as SVGCircleElement | null;
    expect(circle?.getAttribute('fill')).toBe('#9ca3af');
  });

  it('onProcess with isStale=true sets fill to defaultColor #9ca3af', async () => {
    const { motorMeta } = await import('../../../controls/batch3/motor');
    const ctx = makeCtx();
    const gauge = motorMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: '1', isStale: false });
    gauge.onProcess({ value: null, isStale: true });
    const circle = ctx.parentGroup.querySelector('circle') as SVGCircleElement | null;
    expect(circle?.getAttribute('fill')).toBe('#9ca3af');
  });

  it('onUnmount removes all elements and is idempotent', async () => {
    const { motorMeta } = await import('../../../controls/batch3/motor');
    const ctx = makeCtx();
    const gauge = motorMeta.create();
    gauge.onMount(makeWidget(), ctx);
    expect(ctx.parentGroup.childElementCount).toBeGreaterThanOrEqual(1);
    gauge.onUnmount();
    expect(ctx.parentGroup.childElementCount).toBe(0);
    expect(() => gauge.onUnmount()).not.toThrow();
  });
});
