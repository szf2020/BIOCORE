// SP-FX-10 T5: RED tests for ValveGauge (SVG valve + WriteIntent on click).
// SVG rect body + butterfly valve body [data-valve-body], onClick triggers onWriteIntent.
import { describe, it, expect, vi } from 'vitest';
import type { GaugeContext, GaugeClickContext } from '../../../gauge-base';
import type { FuxaWidget } from '../../../../models';

const makeWidget = (overrides: Partial<FuxaWidget> = {}): FuxaWidget => ({
  id: 'w-valve1',
  type: 'svg-ext-valve',
  x: 0,
  y: 0,
  w: 50,
  h: 50,
  property: {
    variableId: 'r1.DO-valve',
    openValue: '1',
    openColor: '#22c55e',
    closedColor: '#ef4444',
  },
  ...overrides,
} as unknown as FuxaWidget);

const makeCtx = (mode: 'editor' | 'runtime' = 'editor'): GaugeContext & { onWriteIntent: ReturnType<typeof vi.fn> } => {
  const onWriteIntent = vi.fn();
  return {
    parentGroup: document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement,
    readValue: vi.fn().mockReturnValue({ value: '0', isStale: false }),
    canvasSize: { width: 800, height: 600 },
    mode,
    onWriteIntent,
  };
};

describe('ValveGauge', () => {
  it('onMount creates SVG elements including [data-valve-body]', async () => {
    const { valveMeta } = await import('../../../controls/batch4/valve');
    const ctx = makeCtx();
    const gauge = valveMeta.create();
    gauge.onMount(makeWidget(), ctx);
    expect(ctx.parentGroup.childElementCount).toBeGreaterThanOrEqual(1);
    const valveBody = ctx.parentGroup.querySelector('[data-valve-body]');
    expect(valveBody).toBeTruthy();
  });

  it('onProcess with openValue matching sets valve body fill to openColor', async () => {
    const { valveMeta } = await import('../../../controls/batch4/valve');
    const ctx = makeCtx();
    const gauge = valveMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: '1', isStale: false });
    const valveBody = ctx.parentGroup.querySelector('[data-valve-body]') as SVGElement | null;
    expect(valveBody?.getAttribute('fill')).toBe('#22c55e');
  });

  it('onProcess with non-matching value sets valve body fill to closedColor', async () => {
    const { valveMeta } = await import('../../../controls/batch4/valve');
    const ctx = makeCtx();
    const gauge = valveMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: '0', isStale: false });
    const valveBody = ctx.parentGroup.querySelector('[data-valve-body]') as SVGElement | null;
    expect(valveBody?.getAttribute('fill')).toBe('#ef4444');
  });

  it('onClick in runtime mode calls ctx.onWriteIntent with correct tag', async () => {
    const { valveMeta } = await import('../../../controls/batch4/valve');
    const ctx = makeCtx('runtime');
    const gauge = valveMeta.create();
    const widget = makeWidget();
    gauge.onMount(widget, ctx);
    gauge.onProcess({ value: '0', isStale: false }); // currently closed
    const clickCtx: GaugeClickContext = { widget, ctx };
    gauge.onClick?.(new MouseEvent('click'), clickCtx);
    expect(ctx.onWriteIntent).toHaveBeenCalledOnce();
    expect(ctx.onWriteIntent).toHaveBeenCalledWith(
      expect.objectContaining({ tag: 'r1.DO-valve', widgetId: 'w-valve1' })
    );
  });

  it('onUnmount removes all elements and is idempotent', async () => {
    const { valveMeta } = await import('../../../controls/batch4/valve');
    const ctx = makeCtx();
    const gauge = valveMeta.create();
    gauge.onMount(makeWidget(), ctx);
    expect(ctx.parentGroup.childElementCount).toBeGreaterThanOrEqual(1);
    gauge.onUnmount();
    expect(ctx.parentGroup.childElementCount).toBe(0);
    expect(() => gauge.onUnmount()).not.toThrow();
  });
});
