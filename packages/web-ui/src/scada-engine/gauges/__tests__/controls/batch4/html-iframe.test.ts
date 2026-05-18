// SP-FX-10 T1: RED tests for HtmlIframeGauge (iframe embed with security sandbox).
// foreignObject + iframe, sandbox="", src URL validation.
import { describe, it, expect, vi } from 'vitest';
import type { GaugeContext } from '../../../gauge-base';
import type { FuxaWidget } from '../../../../models';

const makeWidget = (overrides: Partial<FuxaWidget> = {}): FuxaWidget => ({
  id: 'w-iframe1',
  type: 'svg-ext-html_iframe',
  x: 10,
  y: 20,
  w: 300,
  h: 200,
  property: {
    src: 'https://example.com',
    title: 'Test Frame',
  },
  ...overrides,
} as unknown as FuxaWidget);

const makeCtx = (): GaugeContext => ({
  parentGroup: document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement,
  readValue: vi.fn().mockReturnValue({ value: null, isStale: false }),
  canvasSize: { width: 800, height: 600 },
  mode: 'editor',
});

describe('HtmlIframeGauge', () => {
  it('onMount with valid src creates foreignObject + iframe with sandbox="" and no allow-same-origin', async () => {
    const { htmlIframeMeta } = await import('../../../controls/batch4/html-iframe');
    const ctx = makeCtx();
    const gauge = htmlIframeMeta.create();
    gauge.onMount(makeWidget(), ctx);
    const fo = ctx.parentGroup.querySelector('foreignObject');
    expect(fo).toBeTruthy();
    const iframe = fo?.querySelector('iframe');
    expect(iframe).toBeTruthy();
    const sandboxAttr = iframe?.getAttribute('sandbox') ?? 'MISSING';
    expect(sandboxAttr).toBe('');
    expect(sandboxAttr).not.toContain('allow-same-origin');
    expect(sandboxAttr).not.toContain('allow-scripts');
  });

  it('onMount with invalid src creates foreignObject + div[data-invalid-src], no iframe element', async () => {
    const { htmlIframeMeta } = await import('../../../controls/batch4/html-iframe');
    const ctx = makeCtx();
    const gauge = htmlIframeMeta.create();
    gauge.onMount(makeWidget({ property: { src: 'not-a-url', title: '' } } as any), ctx);
    const fo = ctx.parentGroup.querySelector('foreignObject');
    expect(fo).toBeTruthy();
    const iframe = fo?.querySelector('iframe');
    expect(iframe).toBeNull();
    const placeholder = fo?.querySelector('[data-invalid-src]');
    expect(placeholder).toBeTruthy();
  });

  it('onProcess does not throw (no-op, iframe has no tag binding)', async () => {
    const { htmlIframeMeta } = await import('../../../controls/batch4/html-iframe');
    const ctx = makeCtx();
    const gauge = htmlIframeMeta.create();
    gauge.onMount(makeWidget(), ctx);
    expect(() => gauge.onProcess({ value: 'anything', isStale: false })).not.toThrow();
    expect(() => gauge.onProcess({ value: null, isStale: true })).not.toThrow();
  });

  it('onResize updates foreignObject width and height', async () => {
    const { htmlIframeMeta } = await import('../../../controls/batch4/html-iframe');
    const ctx = makeCtx();
    const gauge = htmlIframeMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onResize(400, 300);
    const fo = ctx.parentGroup.querySelector('foreignObject');
    expect(fo?.getAttribute('width')).toBe('400');
    expect(fo?.getAttribute('height')).toBe('300');
  });

  it('onUnmount removes foreignObject and is idempotent', async () => {
    const { htmlIframeMeta } = await import('../../../controls/batch4/html-iframe');
    const ctx = makeCtx();
    const gauge = htmlIframeMeta.create();
    gauge.onMount(makeWidget(), ctx);
    expect(ctx.parentGroup.childElementCount).toBe(1);
    gauge.onUnmount();
    expect(ctx.parentGroup.childElementCount).toBe(0);
    expect(() => gauge.onUnmount()).not.toThrow();
  });
});
