import { describe, it, expect, vi } from 'vitest';
import { valueMeta } from '../../controls/value';
import type { GaugeContext } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

const makeGroup = () => document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
const makeWidget = (property?: Record<string, unknown>): FuxaWidget => ({
  id: 'w1', type: 'svg-ext-value', property: property ?? {}, x: 10, y: 20, w: 80, h: 40,
});
const makeCtx = (overrides?: Partial<GaugeContext>): GaugeContext => ({
  parentGroup: makeGroup(),
  readValue: vi.fn().mockReturnValue({ value: 42, isStale: false }),
  canvasSize: { width: 800, height: 600 },
  mode: 'editor',
  ...overrides,
});

describe('ValueGauge (svg-ext-value)', () => {
  it('onMount creates <text> element in parentGroup with data-widget-id', () => {
    const ctx = makeCtx();
    valueMeta.create().onMount(makeWidget(), ctx);
    expect(ctx.parentGroup.querySelector('text[data-widget-id="w1"]')).not.toBeNull();
  });

  it('onProcess with valid value updates textContent via format string', () => {
    const ctx = makeCtx({ readValue: vi.fn().mockReturnValue({ value: 3.14, isStale: false }) });
    const g = valueMeta.create();
    g.onMount(makeWidget({ format: '{value} °C' }), ctx);
    g.onProcess({ value: 7.77, isStale: false });
    const el = ctx.parentGroup.querySelector('text') as SVGTextElement;
    expect(el.textContent).toContain('7.77');
  });

  it('runtime mode + isStale=true renders gray FUXA stale token "--"', () => {
    const ctx = makeCtx({ mode: 'runtime' });
    const g = valueMeta.create();
    g.onMount(makeWidget(), ctx);
    g.onProcess({ value: null, isStale: true });
    const el = ctx.parentGroup.querySelector('text') as SVGTextElement;
    expect(el.textContent).toContain('--');
    expect(el.getAttribute('fill')).toBe('#9ca3af');
  });

  it('SP-FX-FF.1.2 editor mode + isStale renders FUXA "#.##" placeholder', () => {
    const ctx = makeCtx({ mode: 'editor' });
    const g = valueMeta.create();
    g.onMount(makeWidget(), ctx);
    g.onProcess({ value: null, isStale: true });
    const el = ctx.parentGroup.querySelector('text') as SVGTextElement;
    expect(el.textContent).toBe('#.##');
    // No prop.color → muted gray placeholder
    expect(el.getAttribute('fill')).toBe('#9ca3af');
  });

  it('SP-FX-FF.7 editor mode + isStale honors prop.color (ColorPaletteBar feedback)', () => {
    const ctx = makeCtx({ mode: 'editor' });
    const g = valueMeta.create();
    g.onMount(makeWidget({ color: '#dc2626' }), ctx);
    g.onProcess({ value: null, isStale: true });
    const el = ctx.parentGroup.querySelector('text') as SVGTextElement;
    expect(el.textContent).toBe('#.##');
    expect(el.getAttribute('fill')).toBe('#dc2626');
  });

  it('SP-FX-FF.7 runtime mode + isStale keeps muted gray regardless of prop.color', () => {
    const ctx = makeCtx({ mode: 'runtime' });
    const g = valueMeta.create();
    g.onMount(makeWidget({ color: '#dc2626' }), ctx);
    g.onProcess({ value: null, isStale: true });
    const el = ctx.parentGroup.querySelector('text') as SVGTextElement;
    expect(el.getAttribute('fill')).toBe('#9ca3af');
  });

  it('onPropertyChange with new format re-renders text on next onProcess', () => {
    const ctx = makeCtx({ readValue: vi.fn().mockReturnValue({ value: 5, isStale: false }) });
    const g = valueMeta.create();
    const widget = makeWidget({ format: '{value}', variableId: 'reactor1.AI-0' });
    g.onMount(widget, ctx);
    const nextWidget: FuxaWidget = { ...widget, property: { ...widget.property, format: '{value} rpm' } as any };
    g.onPropertyChange({ key: 'format', value: '{value} rpm', nextWidget });
    g.onProcess({ value: 5, isStale: false });
    expect((ctx.parentGroup.querySelector('text') as SVGTextElement).textContent).toContain('rpm');
  });

  it('SP-FX-FF.1.4 default font size is 20px when prop.fontSize omitted', () => {
    const ctx = makeCtx();
    const g = valueMeta.create();
    g.onMount({ id: 'w1', type: 'svg-ext-value', property: {}, x: 0, y: 0, w: 200, h: 100 } as any, ctx);
    const el = ctx.parentGroup.querySelector('text') as SVGTextElement;
    expect(el.getAttribute('font-size')).toBe('20');
  });

  it('SP-FX-FF.1.4 explicit fontSize overrides 20px default', () => {
    const ctx = makeCtx();
    const g = valueMeta.create();
    g.onMount({ id: 'w1', type: 'svg-ext-value', property: { fontSize: 32 }, x: 0, y: 0, w: 200, h: 100 } as any, ctx);
    const el = ctx.parentGroup.querySelector('text') as SVGTextElement;
    expect(el.getAttribute('font-size')).toBe('32');
  });

  it('SP-FX-FF.1.4 onResize preserves font size (no auto-scale)', () => {
    const ctx = makeCtx();
    const g = valueMeta.create();
    g.onMount({ id: 'w1', type: 'svg-ext-value', property: {}, x: 0, y: 0, w: 80, h: 40 } as any, ctx);
    const el = ctx.parentGroup.querySelector('text') as SVGTextElement;
    expect(el.getAttribute('font-size')).toBe('20');
    g.onResize(400, 200);
    expect(el.getAttribute('font-size')).toBe('20');
  });

  it('onUnmount removes <text> element from parentGroup', () => {
    const ctx = makeCtx();
    const g = valueMeta.create();
    g.onMount(makeWidget(), ctx);
    expect(ctx.parentGroup.querySelector('text')).not.toBeNull();
    g.onUnmount();
    expect(ctx.parentGroup.querySelector('text')).toBeNull();
  });
});
