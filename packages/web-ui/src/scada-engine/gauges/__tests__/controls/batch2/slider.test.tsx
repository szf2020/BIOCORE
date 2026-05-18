// SP-FX-6.2 T7: RED tests for SliderGauge — run BEFORE impl exists.
import { describe, it, expect, vi } from 'vitest';
import type { GaugeContext } from '../../../gauge-base';
import type { FuxaWidget } from '../../../../models';

const makeWidget = (overrides: Partial<FuxaWidget> = {}): FuxaWidget => ({
  id: 'w4',
  type: 'svg-ext-html_slider',
  x: 5,
  y: 5,
  w: 200,
  h: 40,
  property: {
    variableId: 'r1.AO-0',
    min: 0,
    max: 100,
    step: 1,
  },
  ...overrides,
} as unknown as FuxaWidget);

const makeCtx = (mode: 'editor' | 'runtime' = 'editor'): GaugeContext => ({
  parentGroup: document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement,
  readValue: vi.fn().mockReturnValue({ value: 0, isStale: false }),
  canvasSize: { width: 800, height: 600 },
  mode,
  onWriteIntent: vi.fn(),
});

describe('SliderGauge', () => {
  it('onMount creates foreignObject + input[type=range] with min/max/step and data-widget-id', async () => {
    const { sliderMeta } = await import(
      '../../../controls/batch2/slider'
    );
    const ctx = makeCtx();
    const gauge = sliderMeta.create();
    gauge.onMount(makeWidget(), ctx);
    const fo = ctx.parentGroup.querySelector('foreignObject');
    expect(fo).toBeTruthy();
    expect(fo?.getAttribute('data-widget-id')).toBe('w4');
    const input = ctx.parentGroup.querySelector('input[type="range"]') as HTMLInputElement | null;
    expect(input).toBeTruthy();
    expect(input?.min).toBe('0');
    expect(input?.max).toBe('100');
    expect(input?.step).toBe('1');
  });

  it('onProcess with value=42 sets input.value = "42"', async () => {
    const { sliderMeta } = await import(
      '../../../controls/batch2/slider'
    );
    const ctx = makeCtx();
    const gauge = sliderMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: 42, isStale: false });
    const input = ctx.parentGroup.querySelector('input[type="range"]') as HTMLInputElement;
    expect(input.value).toBe('42');
  });

  it('onPropertyChange updates min/max/step attributes on input', async () => {
    const { sliderMeta } = await import(
      '../../../controls/batch2/slider'
    );
    const ctx = makeCtx();
    const gauge = sliderMeta.create();
    gauge.onMount(makeWidget(), ctx);
    const nextWidget = makeWidget({
      property: { variableId: 'r1.AO-0', min: 10, max: 90, step: 5 },
    } as Partial<FuxaWidget>);
    gauge.onPropertyChange({ key: 'min', value: 10, nextWidget });
    const input = ctx.parentGroup.querySelector('input[type="range"]') as HTMLInputElement;
    expect(input.min).toBe('10');
    expect(input.max).toBe('90');
    expect(input.step).toBe('5');
  });

  it('change event in runtime mode calls ctx.onWriteIntent with numeric value', async () => {
    const { sliderMeta } = await import(
      '../../../controls/batch2/slider'
    );
    const ctx = makeCtx('runtime');
    const gauge = sliderMeta.create();
    gauge.onMount(makeWidget(), ctx);
    const input = ctx.parentGroup.querySelector('input[type="range"]') as HTMLInputElement;
    input.value = '42';
    input.dispatchEvent(new Event('change'));
    expect(ctx.onWriteIntent).toHaveBeenCalledWith({
      tag: 'r1.AO-0',
      value: 42,
      widgetId: 'w4',
    });
  });

  it('onUnmount removes foreignObject and is idempotent', async () => {
    const { sliderMeta } = await import(
      '../../../controls/batch2/slider'
    );
    const ctx = makeCtx();
    const gauge = sliderMeta.create();
    gauge.onMount(makeWidget(), ctx);
    expect(ctx.parentGroup.childElementCount).toBe(1);
    gauge.onUnmount();
    expect(ctx.parentGroup.childElementCount).toBe(0);
    expect(() => gauge.onUnmount()).not.toThrow();
  });
});
