// SP-FX-9 T1: RED tests for HtmlBagGauge (LED indicator).
// foreignObject + colored div, dual/multi-state LED.
import { describe, it, expect, vi } from 'vitest';
import type { GaugeContext } from '../../../gauge-base';
import type { FuxaWidget } from '../../../../models';

const makeWidget = (overrides: Partial<FuxaWidget> = {}): FuxaWidget => ({
  id: 'w-bag1',
  type: 'svg-ext-html_bag',
  x: 10,
  y: 20,
  w: 40,
  h: 40,
  property: {
    variableId: 'r1.DO-0',
    onColor: '#22c55e',
    offColor: '#6b7280',
    onValue: '1',
    shape: 'circle',
  },
  ...overrides,
} as unknown as FuxaWidget);

const makeCtx = (): GaugeContext => ({
  parentGroup: document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement,
  readValue: vi.fn().mockReturnValue({ value: '0', isStale: false }),
  canvasSize: { width: 800, height: 600 },
  mode: 'editor',
});

describe('HtmlBagGauge', () => {
  it('onMount creates foreignObject with data-widget-id and a div inside', async () => {
    const { htmlBagMeta } = await import('../../../controls/batch3/html-bag');
    const ctx = makeCtx();
    const gauge = htmlBagMeta.create();
    gauge.onMount(makeWidget(), ctx);
    const fo = ctx.parentGroup.querySelector('foreignObject');
    expect(fo).toBeTruthy();
    expect(fo?.getAttribute('data-widget-id')).toBe('w-bag1');
    const div = fo?.querySelector('div');
    expect(div).toBeTruthy();
  });

  it('onProcess with value "1" (= onValue) sets data-color to onColor', async () => {
    const { htmlBagMeta } = await import('../../../controls/batch3/html-bag');
    const ctx = makeCtx();
    const gauge = htmlBagMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: '1', isStale: false });
    const div = ctx.parentGroup.querySelector('foreignObject div') as HTMLElement | null;
    expect(div?.dataset['color']).toBe('#22c55e');
  });

  it('onProcess with value "0" (off) sets data-color to offColor', async () => {
    const { htmlBagMeta } = await import('../../../controls/batch3/html-bag');
    const ctx = makeCtx();
    const gauge = htmlBagMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: '0', isStale: false });
    const div = ctx.parentGroup.querySelector('foreignObject div') as HTMLElement | null;
    expect(div?.dataset['color']).toBe('#6b7280');
  });

  it('onProcess with isStale=true sets data-color to stale gray #9ca3af', async () => {
    const { htmlBagMeta } = await import('../../../controls/batch3/html-bag');
    const ctx = makeCtx();
    const gauge = htmlBagMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: null, isStale: true });
    const div = ctx.parentGroup.querySelector('foreignObject div') as HTMLElement | null;
    expect(div?.dataset['color']).toBe('#9ca3af');
  });

  it('onUnmount removes foreignObject and is idempotent', async () => {
    const { htmlBagMeta } = await import('../../../controls/batch3/html-bag');
    const ctx = makeCtx();
    const gauge = htmlBagMeta.create();
    gauge.onMount(makeWidget(), ctx);
    expect(ctx.parentGroup.childElementCount).toBe(1);
    gauge.onUnmount();
    expect(ctx.parentGroup.childElementCount).toBe(0);
    expect(() => gauge.onUnmount()).not.toThrow();
  });

  // SP-FX-48.22 phase 3 finale: displayMode='gauge' renders SVG arc gauge.
  it('displayMode=gauge mounts track + value arc + label (no foreignObject)', async () => {
    const { htmlBagMeta } = await import('../../../controls/batch3/html-bag');
    const ctx = makeCtx();
    const gauge = htmlBagMeta.create();
    gauge.onMount(makeWidget({
      w: 80, h: 80,
      property: { variableId: 'r1.AI-0', displayMode: 'gauge', min: 0, max: 100 },
    } as any), ctx);
    expect(ctx.parentGroup.querySelector('foreignObject')).toBeNull();
    expect(ctx.parentGroup.querySelector('path[data-bag-track="true"]')).not.toBeNull();
    expect(ctx.parentGroup.querySelector('path[data-bag-value="true"]')).not.toBeNull();
    expect(ctx.parentGroup.querySelector('text[data-bag-label="true"]')).not.toBeNull();
  });

  it('gauge mode onProcess value=50 sets value arc d attribute and label text', async () => {
    const { htmlBagMeta } = await import('../../../controls/batch3/html-bag');
    const ctx = makeCtx();
    const gauge = htmlBagMeta.create();
    gauge.onMount(makeWidget({
      w: 80, h: 80,
      property: { variableId: 'r1.AI-0', displayMode: 'gauge', min: 0, max: 100, decimals: 0 },
    } as any), ctx);
    gauge.onProcess({ value: 50, isStale: false });
    const label = ctx.parentGroup.querySelector('text[data-bag-label="true"]') as SVGTextElement | null;
    expect(label?.textContent).toBe('50');
    const valuePath = ctx.parentGroup.querySelector('path[data-bag-value="true"]') as SVGPathElement | null;
    expect(valuePath?.getAttribute('d')?.startsWith('M')).toBe(true);
  });

  it('gauge mode stale value resets to placeholder + stale color', async () => {
    const { htmlBagMeta } = await import('../../../controls/batch3/html-bag');
    const ctx = makeCtx();
    const gauge = htmlBagMeta.create();
    gauge.onMount(makeWidget({
      w: 80, h: 80,
      property: { variableId: 'r1.AI-0', displayMode: 'gauge', min: 0, max: 100 },
    } as any), ctx);
    gauge.onProcess({ value: null, isStale: true });
    const label = ctx.parentGroup.querySelector('text[data-bag-label="true"]') as SVGTextElement | null;
    expect(label?.textContent).toBe('--');
    const valuePath = ctx.parentGroup.querySelector('path[data-bag-value="true"]') as SVGPathElement | null;
    expect(valuePath?.getAttribute('stroke')).toBe('#9ca3af');
  });
});
