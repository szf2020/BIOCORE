// SP-FX-FF.38: ShapeGauge — RED-first tests.
// Runtime hookup for FUXA shape widgets (type='shape'). On mount, attaches to
// existing DOM created by canvas-svg case 'shape' (does NOT re-create elements
// — avoids double-render with CanvasController.loadView). On process:
//   - matchRange(prop.ranges) → set fill on all child elements
//   - applyActions(prop.actions) → apply hide/show/blink on root wrapper

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GaugeContext } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

function makeShapeDom(parent: SVGGElement, widgetId: string): SVGElement {
  const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  wrap.setAttribute('data-widget-id', widgetId);
  wrap.setAttribute('data-shape-name', 'eli');
  const child1 = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
  child1.setAttribute('cx', '50');
  child1.setAttribute('cy', '50');
  child1.setAttribute('rx', '40');
  child1.setAttribute('ry', '20');
  child1.setAttribute('fill', '#aaaaaa');
  child1.setAttribute('stroke', '#1e293b');
  wrap.appendChild(child1);
  const child2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  child2.setAttribute('d', 'M0 0 L10 10');
  child2.setAttribute('fill', '#aaaaaa');
  wrap.appendChild(child2);
  parent.appendChild(wrap);
  return wrap;
}

const makeWidget = (overrides: Partial<FuxaWidget> = {}): FuxaWidget => ({
  id: 'ws1',
  type: 'shape',
  x: 0, y: 0, w: 100, h: 60,
  property: {
    shapeName: 'eli',
    fill: '#aaaaaa',
    variableId: 'r1.AI-0',
    ranges: [
      { min: 0, max: 49, color: '#22c55e' },
      { min: 50, max: 100, color: '#ef4444' },
    ],
    actions: [
      { type: 'blink', range: { min: 80, max: 100 }, options: { period: 200 } },
    ],
  },
  ...overrides,
} as unknown as FuxaWidget);

const makeCtx = (parent: SVGGElement): GaugeContext => ({
  parentGroup: parent,
  readValue: vi.fn().mockReturnValue({ value: 0, isStale: false }),
  canvasSize: { width: 800, height: 600 },
  mode: 'runtime',
});

describe('ShapeGauge', () => {
  let parent: SVGGElement;
  beforeEach(() => {
    parent = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
  });

  it('shapeMeta is registered with widgetType "shape"', async () => {
    const { shapeMeta } = await import('../shape');
    expect(shapeMeta.widgetType).toBe('shape');
    expect(typeof shapeMeta.create).toBe('function');
  });

  it('getSignals returns [variableId] when set', async () => {
    const { shapeMeta } = await import('../shape');
    expect(shapeMeta.getSignals(makeWidget())).toEqual(['r1.AI-0']);
  });

  it('getSignals returns [] when variableId absent', async () => {
    const { shapeMeta } = await import('../shape');
    expect(shapeMeta.getSignals(makeWidget({ property: { shapeName: 'eli' } } as unknown as FuxaWidget))).toEqual([]);
  });

  it('onMount attaches to existing shape DOM without recreating', async () => {
    const { shapeMeta } = await import('../shape');
    makeShapeDom(parent, 'ws1');
    const ctx = makeCtx(parent);
    const gauge = shapeMeta.create();
    gauge.onMount(makeWidget(), ctx);
    expect(parent.querySelectorAll('[data-widget-id="ws1"]')).toHaveLength(1);
  });

  it('onProcess with value=25 applies first range color #22c55e to all children', async () => {
    const { shapeMeta } = await import('../shape');
    const wrap = makeShapeDom(parent, 'ws1');
    const ctx = makeCtx(parent);
    const gauge = shapeMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: 25, isStale: false });
    const children = wrap.querySelectorAll('ellipse, path, rect, circle, polygon');
    expect(children.length).toBeGreaterThan(0);
    for (const c of Array.from(children)) {
      expect(c.getAttribute('fill')).toBe('#22c55e');
    }
  });

  it('onProcess with value=75 applies second range color #ef4444', async () => {
    const { shapeMeta } = await import('../shape');
    const wrap = makeShapeDom(parent, 'ws1');
    const ctx = makeCtx(parent);
    const gauge = shapeMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: 75, isStale: false });
    const ellipse = wrap.querySelector('ellipse')!;
    expect(ellipse.getAttribute('fill')).toBe('#ef4444');
  });

  it('onProcess with out-of-range value keeps original fill', async () => {
    const { shapeMeta } = await import('../shape');
    const wrap = makeShapeDom(parent, 'ws1');
    const ctx = makeCtx(parent);
    const gauge = shapeMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: 200, isStale: false });
    const ellipse = wrap.querySelector('ellipse')!;
    expect(ellipse.getAttribute('fill')).toBe('#aaaaaa');
  });

  it('onProcess with value in blink action range toggles visibility over time', async () => {
    vi.useFakeTimers();
    const { shapeMeta } = await import('../shape');
    const wrap = makeShapeDom(parent, 'ws1');
    const ctx = makeCtx(parent);
    const gauge = shapeMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: 90, isStale: false });
    const visBefore = (wrap as unknown as HTMLElement).style.visibility;
    vi.advanceTimersByTime(250);
    const visAfter = (wrap as unknown as HTMLElement).style.visibility;
    expect(visAfter).not.toBe(visBefore);
    gauge.onUnmount();
    vi.useRealTimers();
  });

  it('onUnmount clears blink interval and is idempotent', async () => {
    const { shapeMeta } = await import('../shape');
    makeShapeDom(parent, 'ws1');
    const ctx = makeCtx(parent);
    const gauge = shapeMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: 90, isStale: false });
    expect(() => gauge.onUnmount()).not.toThrow();
    expect(() => gauge.onUnmount()).not.toThrow();
  });

  // SP-FX-FF.40: rotate animation
  it('rotateSpeed=0 (default) → no rAF started, wrap has no transform style', async () => {
    const { shapeMeta } = await import('../shape');
    const wrap = makeShapeDom(parent, 'ws1');
    const ctx = makeCtx(parent);
    const gauge = shapeMeta.create();
    gauge.onMount(makeWidget({ property: { shapeName: 'eli', fill: '#aaa' } } as unknown as FuxaWidget), ctx);
    expect((wrap as unknown as HTMLElement).style.transform || '').toBe('');
    gauge.onUnmount();
  });

  it('rotateSpeed=90 → onMount sets transform-box/origin and schedules rAF', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
    const { shapeMeta } = await import('../shape');
    const wrap = makeShapeDom(parent, 'ws1');
    const ctx = makeCtx(parent);
    const gauge = shapeMeta.create();
    gauge.onMount(makeWidget({ property: { shapeName: 'eli', fill: '#aaa', rotateSpeed: 90 } } as unknown as FuxaWidget), ctx);
    expect((wrap as unknown as HTMLElement).style.transformBox).toBe('fill-box');
    expect((wrap as unknown as HTMLElement).style.transformOrigin).toBe('center');
    expect(rafSpy).toHaveBeenCalled();
    gauge.onUnmount();
    rafSpy.mockRestore();
  });

  it('onUnmount cancels rotation rAF', async () => {
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
    const { shapeMeta } = await import('../shape');
    makeShapeDom(parent, 'ws1');
    const ctx = makeCtx(parent);
    const gauge = shapeMeta.create();
    gauge.onMount(makeWidget({ property: { shapeName: 'eli', fill: '#aaa', rotateSpeed: 180 } } as unknown as FuxaWidget), ctx);
    gauge.onUnmount();
    expect(cancelSpy).toHaveBeenCalled();
    cancelSpy.mockRestore();
  });

  it('onPropertyChange updates widget reference for subsequent onProcess', async () => {
    const { shapeMeta } = await import('../shape');
    const wrap = makeShapeDom(parent, 'ws1');
    const ctx = makeCtx(parent);
    const gauge = shapeMeta.create();
    gauge.onMount(makeWidget(), ctx);
    const next = makeWidget({
      property: {
        shapeName: 'eli', variableId: 'r1.AI-0',
        ranges: [{ min: 0, max: 100, color: '#0ea5e9' }],
        actions: [],
      },
    } as unknown as FuxaWidget);
    gauge.onPropertyChange({ key: 'ranges', value: next.property, nextWidget: next });
    gauge.onProcess({ value: 50, isStale: false });
    expect(wrap.querySelector('ellipse')!.getAttribute('fill')).toBe('#0ea5e9');
  });
});
