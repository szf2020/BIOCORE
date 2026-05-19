// SP-FX-48.7 + SP-FX-48.22: PanelGauge tests
import { describe, it, expect, vi } from 'vitest';
import type { GaugeContext } from '../../../gauge-base';
import type { FuxaWidget } from '../../../../models';

const makeWidget = (overrides: Partial<FuxaWidget> = {}): FuxaWidget => ({
  id: 'pn1',
  type: 'svg-ext-panel',
  x: 10,
  y: 20,
  w: 200,
  h: 120,
  property: {},
  ...overrides,
} as unknown as FuxaWidget);

const makeCtx = (mode: 'editor' | 'runtime' = 'editor'): GaugeContext => ({
  parentGroup: document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement,
  readValue: vi.fn().mockReturnValue({ value: null, isStale: true }),
  canvasSize: { width: 800, height: 600 },
  mode,
});

describe('PanelGauge', () => {
  it('onMount renders rect with default fill/stroke and data-widget-id', async () => {
    const { panelMeta } = await import('../../../controls/batch5/panel');
    const ctx = makeCtx();
    const gauge = panelMeta.create();
    gauge.onMount(makeWidget(), ctx);
    const rect = ctx.parentGroup.querySelector('rect[data-widget-id="pn1"]') as SVGRectElement | null;
    expect(rect).not.toBeNull();
    expect(rect?.getAttribute('fill')).toBe('#f8fafc');
  });

  it('onMount with title renders text element above rect', async () => {
    const { panelMeta } = await import('../../../controls/batch5/panel');
    const ctx = makeCtx();
    const gauge = panelMeta.create();
    gauge.onMount(makeWidget({ property: { title: '锅炉总览' } } as any), ctx);
    const text = ctx.parentGroup.querySelector('text');
    expect(text?.textContent).toBe('锅炉总览');
  });

  it('onMount without viewName: no data-nested-view, no marker text, solid stroke', async () => {
    const { panelMeta } = await import('../../../controls/batch5/panel');
    const ctx = makeCtx();
    const gauge = panelMeta.create();
    gauge.onMount(makeWidget(), ctx);
    const rect = ctx.parentGroup.querySelector('rect') as SVGRectElement;
    expect(rect.hasAttribute('data-nested-view')).toBe(false);
    expect(rect.hasAttribute('stroke-dasharray')).toBe(false);
    expect(ctx.parentGroup.querySelector('[data-panel-nested-marker]')).toBeNull();
  });

  // SP-FX-48.22: viewName binding
  it('with viewName in editor mode: rect gets data-nested-view + dashed stroke + marker text shown', async () => {
    const { panelMeta } = await import('../../../controls/batch5/panel');
    const ctx = makeCtx('editor');
    const gauge = panelMeta.create();
    gauge.onMount(makeWidget({ property: { viewName: 'boiler-detail' } } as any), ctx);
    const rect = ctx.parentGroup.querySelector('rect') as SVGRectElement;
    expect(rect.getAttribute('data-nested-view')).toBe('boiler-detail');
    expect(rect.getAttribute('stroke-dasharray')).toBe('4 2');
    const marker = ctx.parentGroup.querySelector('[data-panel-nested-marker]') as SVGTextElement | null;
    expect(marker?.textContent).toBe('[嵌入视图: boiler-detail]');
  });

  it('with viewName in runtime mode: marker text hidden (host renders the nested view)', async () => {
    const { panelMeta } = await import('../../../controls/batch5/panel');
    const ctx = makeCtx('runtime');
    const gauge = panelMeta.create();
    gauge.onMount(makeWidget({ property: { viewName: 'boiler-detail' } } as any), ctx);
    expect(ctx.parentGroup.querySelector('[data-panel-nested-marker]')).toBeNull();
    const rect = ctx.parentGroup.querySelector('rect') as SVGRectElement;
    expect(rect.getAttribute('data-nested-view')).toBe('boiler-detail');
  });

  it('onUnmount removes all elements and is idempotent', async () => {
    const { panelMeta } = await import('../../../controls/batch5/panel');
    const ctx = makeCtx();
    const gauge = panelMeta.create();
    gauge.onMount(makeWidget({ property: { title: 'T', viewName: 'v1' } } as any), ctx);
    expect(ctx.parentGroup.childElementCount).toBeGreaterThan(0);
    gauge.onUnmount();
    expect(ctx.parentGroup.childElementCount).toBe(0);
    expect(() => gauge.onUnmount()).not.toThrow();
  });
});
