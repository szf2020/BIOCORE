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

  it('onProcess with isStale=true renders gray "--"', () => {
    const ctx = makeCtx();
    const g = valueMeta.create();
    g.onMount(makeWidget(), ctx);
    g.onProcess({ value: null, isStale: true });
    const el = ctx.parentGroup.querySelector('text') as SVGTextElement;
    expect(el.textContent).toContain('--');
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

  it('SP-FX-FF.1 auto font: omitted fontSize → scales with bbox h (~0.85 * h)', () => {
    const ctx = makeCtx();
    const g = valueMeta.create();
    g.onMount({ id: 'w1', type: 'svg-ext-value', property: {}, x: 0, y: 0, w: 200, h: 100 } as any, ctx);
    const el = ctx.parentGroup.querySelector('text') as SVGTextElement;
    const fs = Number(el.getAttribute('font-size'));
    // h=100, byHeight=85; byWidth=200/(4*0.55)=90.9; min=85
    expect(fs).toBeGreaterThanOrEqual(70);
    expect(fs).toBeLessThanOrEqual(95);
  });

  it('SP-FX-FF.1 auto font: width-clamped on narrow tall widget', () => {
    const ctx = makeCtx();
    const g = valueMeta.create();
    g.onMount({ id: 'w1', type: 'svg-ext-value', property: {}, x: 0, y: 0, w: 40, h: 200 } as any, ctx);
    const el = ctx.parentGroup.querySelector('text') as SVGTextElement;
    const fs = Number(el.getAttribute('font-size'));
    expect(fs).toBeLessThanOrEqual(25);
  });

  it('SP-FX-FF.1 explicit fontSize bypasses auto sizing', () => {
    const ctx = makeCtx();
    const g = valueMeta.create();
    g.onMount({ id: 'w1', type: 'svg-ext-value', property: { fontSize: 32 }, x: 0, y: 0, w: 200, h: 100 } as any, ctx);
    const el = ctx.parentGroup.querySelector('text') as SVGTextElement;
    expect(el.getAttribute('font-size')).toBe('32');
  });

  it('SP-FX-FF.1 onResize recomputes auto font', () => {
    const ctx = makeCtx();
    const g = valueMeta.create();
    g.onMount({ id: 'w1', type: 'svg-ext-value', property: {}, x: 0, y: 0, w: 80, h: 40 } as any, ctx);
    const el = ctx.parentGroup.querySelector('text') as SVGTextElement;
    const before = Number(el.getAttribute('font-size'));
    g.onResize(400, 200);
    const after = Number(el.getAttribute('font-size'));
    expect(after).toBeGreaterThan(before);
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
