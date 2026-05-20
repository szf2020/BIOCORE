import { describe, it, expect, vi } from 'vitest';
import { htmlInputMeta } from '../../controls/html-input';
import type { GaugeContext } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

const makeGroup = () => document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
const makeWidget = (property?: Record<string, unknown>): FuxaWidget => ({
  id: 'i1', type: 'svg-ext-html_input', property: property ?? { variableId: 'reactor1.AI-0' },
  x: 0, y: 0, w: 120, h: 32,
});
const makeCtx = (overrides?: Partial<GaugeContext>): GaugeContext => ({
  parentGroup: makeGroup(),
  readValue: vi.fn().mockReturnValue({ value: 0, isStale: false }),
  canvasSize: { width: 800, height: 600 },
  mode: 'editor',
  ...overrides,
});

describe('HtmlInputGauge (svg-ext-html_input)', () => {
  it('onMount creates <foreignObject> with <input> child in parentGroup', () => {
    const ctx = makeCtx();
    htmlInputMeta.create().onMount(makeWidget(), ctx);
    expect(ctx.parentGroup.querySelector('foreignObject')).not.toBeNull();
    expect(ctx.parentGroup.querySelector('input')).not.toBeNull();
  });

  it('SP-FX-FF.2 default placeholder is "#.##" when prop.placeholder unset', () => {
    const ctx = makeCtx();
    htmlInputMeta.create().onMount(makeWidget(), ctx);
    const input = ctx.parentGroup.querySelector('input') as HTMLInputElement;
    expect(input.placeholder).toBe('#.##');
  });

  it('SP-FX-FF.2 explicit prop.placeholder overrides "#.##" default', () => {
    const ctx = makeCtx();
    htmlInputMeta.create().onMount(makeWidget({ variableId: 'r1.AI-0', placeholder: '请输入' }), ctx);
    const input = ctx.parentGroup.querySelector('input') as HTMLInputElement;
    expect(input.placeholder).toBe('请输入');
  });

  it('SP-FX-FF.2 input font-size style is 20px', () => {
    const ctx = makeCtx();
    htmlInputMeta.create().onMount(makeWidget(), ctx);
    const input = ctx.parentGroup.querySelector('input') as HTMLInputElement;
    expect(input.style.fontSize).toBe('20px');
  });

  it('onProcess updates input.value when input is NOT focused', () => {
    const ctx = makeCtx();
    const g = htmlInputMeta.create();
    g.onMount(makeWidget(), ctx);
    g.onProcess({ value: 99, isStale: false });
    expect((ctx.parentGroup.querySelector('input') as HTMLInputElement).value).toBe('99');
  });

  it('Enter key in runtime mode calls ctx.onWriteIntent', () => {
    const onWriteIntent = vi.fn();
    const ctx = makeCtx({ mode: 'runtime', onWriteIntent });
    const g = htmlInputMeta.create();
    g.onMount(makeWidget({ variableId: 'reactor1.AI-0' }), ctx);
    const input = ctx.parentGroup.querySelector('input') as HTMLInputElement;
    input.value = '42';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onWriteIntent).toHaveBeenCalledWith({ tag: 'reactor1.AI-0', value: '42', widgetId: 'i1' });
  });

  it('isSubmitting guard prevents double-fire on Enter + blur in same tick', () => {
    const onWriteIntent = vi.fn();
    const ctx = makeCtx({ mode: 'runtime', onWriteIntent });
    const g = htmlInputMeta.create();
    g.onMount(makeWidget({ variableId: 'reactor1.AI-0' }), ctx);
    const input = ctx.parentGroup.querySelector('input') as HTMLInputElement;
    input.value = '10';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    expect(onWriteIntent).toHaveBeenCalledTimes(1);
  });

  it('onUnmount removes <foreignObject> from parentGroup', () => {
    const ctx = makeCtx();
    const g = htmlInputMeta.create();
    g.onMount(makeWidget(), ctx);
    g.onUnmount();
    expect(ctx.parentGroup.querySelector('foreignObject')).toBeNull();
  });
});
