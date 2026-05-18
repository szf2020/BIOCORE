// SP-FX-6.2 T1: RED tests for GaugeSemaphore — run BEFORE impl exists.
// SP-FX-14: added blink/hide/show action tests
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GaugeContext } from '../../../gauge-base';
import type { FuxaWidget } from '../../../../models';

const makeWidget = (overrides: Partial<FuxaWidget> = {}): FuxaWidget => ({
  id: 'w1',
  type: 'svg-ext-gauge_semaphore',
  property: {
    variableId: 'r1.AI-0',
    ranges: [
      { min: 0, max: 49, color: '#ff0000' },
      { min: 50, max: 100, color: '#00ff00' },
    ],
  },
  ...overrides,
} as unknown as FuxaWidget);

const makeCtx = (): GaugeContext => ({
  parentGroup: document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement,
  readValue: vi.fn().mockReturnValue({ value: 0, isStale: false }),
  canvasSize: { width: 800, height: 600 },
  mode: 'editor',
});

describe('GaugeSemaphore', () => {
  it('onMount creates a circle with data-widget-id in parentGroup', async () => {
    const { gaugeSemaphoreMeta } = await import(
      '../../../controls/batch2/gauge-semaphore'
    );
    const ctx = makeCtx();
    const gauge = gaugeSemaphoreMeta.create();
    gauge.onMount(makeWidget(), ctx);
    const el = ctx.parentGroup.querySelector('[data-widget-id="w1"]');
    expect(el).toBeTruthy();
  });

  it('onProcess with value 75 sets fill to range color #00ff00', async () => {
    const { gaugeSemaphoreMeta } = await import(
      '../../../controls/batch2/gauge-semaphore'
    );
    const ctx = makeCtx();
    const gauge = gaugeSemaphoreMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: 75, isStale: false });
    const el = ctx.parentGroup.querySelector('[data-widget-id="w1"]') as Element;
    expect(el?.getAttribute('fill')).toBe('#00ff00');
  });

  it('onProcess with isStale=true sets fill to gray #9ca3af', async () => {
    const { gaugeSemaphoreMeta } = await import(
      '../../../controls/batch2/gauge-semaphore'
    );
    const ctx = makeCtx();
    const gauge = gaugeSemaphoreMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: null, isStale: true });
    const el = ctx.parentGroup.querySelector('[data-widget-id="w1"]') as Element;
    expect(el?.getAttribute('fill')).toBe('#9ca3af');
  });

  it('onPropertyChange with new ranges updates fill on next onProcess', async () => {
    const { gaugeSemaphoreMeta } = await import(
      '../../../controls/batch2/gauge-semaphore'
    );
    const ctx = makeCtx();
    const gauge = gaugeSemaphoreMeta.create();
    const widget = makeWidget();
    gauge.onMount(widget, ctx);
    const nextWidget = makeWidget({
      property: {
        variableId: 'r1.AI-0',
        ranges: [{ min: 0, max: 100, color: '#0000ff' }],
      },
    } as Partial<FuxaWidget>);
    gauge.onPropertyChange({ key: 'ranges', value: nextWidget.property, nextWidget });
    gauge.onProcess({ value: 75, isStale: false });
    const el = ctx.parentGroup.querySelector('[data-widget-id="w1"]') as Element;
    expect(el?.getAttribute('fill')).toBe('#0000ff');
  });

  it('onUnmount removes the element and is idempotent', async () => {
    const { gaugeSemaphoreMeta } = await import(
      '../../../controls/batch2/gauge-semaphore'
    );
    const ctx = makeCtx();
    const gauge = gaugeSemaphoreMeta.create();
    gauge.onMount(makeWidget(), ctx);
    expect(ctx.parentGroup.childElementCount).toBe(1);
    gauge.onUnmount();
    expect(ctx.parentGroup.childElementCount).toBe(0);
    expect(() => gauge.onUnmount()).not.toThrow();
  });
});

// SP-FX-14: blink/hide/show action tests
describe('GaugeSemaphore — blink/hide/show actions', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const makeActionWidget = (actionType: 'blink' | 'hide' | 'show', rangeMatch: boolean) =>
    makeWidget({
      property: {
        variableId: 'r1.AI-0',
        ranges: [{ min: 0, max: 100, color: '#00ff00' }],
        options: {
          semaphoreActions: [
            {
              type: actionType,
              variableId: 'r1.AI-0',
              range: rangeMatch ? { min: 0, max: 100 } : { min: 200, max: 300 },
            },
          ],
        },
      },
    } as Partial<FuxaWidget>);

  it('hide action with range match: circleEl style.display = "none"', async () => {
    const { gaugeSemaphoreMeta } = await import('../../../controls/batch2/gauge-semaphore');
    const ctx = makeCtx();
    const gauge = gaugeSemaphoreMeta.create();
    gauge.onMount(makeActionWidget('hide', true), ctx);
    gauge.onProcess({ value: 50, isStale: false });
    const el = ctx.parentGroup.querySelector('[data-widget-id="w1"]') as SVGCircleElement | null;
    expect(el).toBeTruthy();
    expect((el as unknown as HTMLElement).style.display).toBe('none');
  });

  it('show action with range match: circleEl style.display = ""', async () => {
    const { gaugeSemaphoreMeta } = await import('../../../controls/batch2/gauge-semaphore');
    const ctx = makeCtx();
    const gauge = gaugeSemaphoreMeta.create();
    gauge.onMount(makeActionWidget('show', true), ctx);
    gauge.onProcess({ value: 50, isStale: false });
    const el = ctx.parentGroup.querySelector('[data-widget-id="w1"]') as SVGCircleElement | null;
    expect(el).toBeTruthy();
    expect((el as unknown as HTMLElement).style.display).toBe('');
  });

  it('blink action with range match: blinkInterval starts and toggles visibility', async () => {
    const { gaugeSemaphoreMeta } = await import('../../../controls/batch2/gauge-semaphore');
    const ctx = makeCtx();
    const gauge = gaugeSemaphoreMeta.create();
    gauge.onMount(makeActionWidget('blink', true), ctx);
    gauge.onProcess({ value: 50, isStale: false });
    const el = ctx.parentGroup.querySelector('[data-widget-id="w1"]') as SVGCircleElement | null;
    const visibilityBefore = (el as unknown as HTMLElement).style.visibility;
    vi.advanceTimersByTime(500);
    const visibilityAfter = (el as unknown as HTMLElement).style.visibility;
    // visibility should have toggled
    expect(visibilityAfter).not.toBe(visibilityBefore);
  });

  it('blink action with no range match: no interval, visibility unchanged', async () => {
    const { gaugeSemaphoreMeta } = await import('../../../controls/batch2/gauge-semaphore');
    const ctx = makeCtx();
    const gauge = gaugeSemaphoreMeta.create();
    gauge.onMount(makeActionWidget('blink', false), ctx);
    gauge.onProcess({ value: 50, isStale: false });
    const el = ctx.parentGroup.querySelector('[data-widget-id="w1"]') as SVGCircleElement | null;
    const visibilityBefore = (el as unknown as HTMLElement).style.visibility;
    vi.advanceTimersByTime(600);
    const visibilityAfter = (el as unknown as HTMLElement).style.visibility;
    expect(visibilityAfter).toBe(visibilityBefore);
  });

  it('onUnmount clears blinkInterval and does not throw', async () => {
    const { gaugeSemaphoreMeta } = await import('../../../controls/batch2/gauge-semaphore');
    const ctx = makeCtx();
    const gauge = gaugeSemaphoreMeta.create();
    gauge.onMount(makeActionWidget('blink', true), ctx);
    gauge.onProcess({ value: 50, isStale: false });
    expect(() => gauge.onUnmount()).not.toThrow();
    // interval cleared — advancing time should not throw
    vi.advanceTimersByTime(1000);
  });
});
