// SP-FX-9 T9: RED tests for HtmlImageGauge (foreignObject img).
// Supports static src or tag-bound dynamic src.
import { describe, it, expect, vi } from 'vitest';
import type { GaugeContext } from '../../../gauge-base';
import type { FuxaWidget } from '../../../../models';

const makeWidget = (overrides: Partial<FuxaWidget> = {}): FuxaWidget => ({
  id: 'w-img1',
  type: 'svg-ext-html_img',
  x: 0,
  y: 0,
  w: 120,
  h: 80,
  property: {
    src: 'https://example.com/logo.png',
    fit: 'contain',
  },
  ...overrides,
} as unknown as FuxaWidget);

const makeCtx = (): GaugeContext => ({
  parentGroup: document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement,
  readValue: vi.fn().mockReturnValue({ value: '', isStale: false }),
  canvasSize: { width: 800, height: 600 },
  mode: 'editor',
});

describe('HtmlImageGauge', () => {
  it('onMount creates foreignObject with data-widget-id containing an img element', async () => {
    const { htmlImageMeta } = await import('../../../controls/batch3/html-image');
    const ctx = makeCtx();
    const gauge = htmlImageMeta.create();
    gauge.onMount(makeWidget(), ctx);
    const fo = ctx.parentGroup.querySelector('foreignObject');
    expect(fo).toBeTruthy();
    expect(fo?.getAttribute('data-widget-id')).toBe('w-img1');
    const img = fo?.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('https://example.com/logo.png');
  });

  it('onProcess with variableId: overrides img src from tag value when not stale', async () => {
    const { htmlImageMeta } = await import('../../../controls/batch3/html-image');
    const ctx = makeCtx();
    const gauge = htmlImageMeta.create();
    gauge.onMount(makeWidget({
      property: {
        src: 'https://example.com/logo.png',
        variableId: 'r1.IMG-0',
        fit: 'contain',
      },
    } as any), ctx);
    gauge.onProcess({ value: 'https://example.com/live.png', isStale: false });
    const img = ctx.parentGroup.querySelector('img') as HTMLImageElement | null;
    expect(img?.getAttribute('src')).toBe('https://example.com/live.png');
  });

  it('onPropertyChange updates img src from property.src', async () => {
    const { htmlImageMeta } = await import('../../../controls/batch3/html-image');
    const ctx = makeCtx();
    const gauge = htmlImageMeta.create();
    const w = makeWidget();
    gauge.onMount(w, ctx);
    const nextWidget = makeWidget({
      property: { src: 'https://example.com/updated.png', fit: 'cover' },
    } as any);
    gauge.onPropertyChange({ key: 'src', value: 'https://example.com/updated.png', nextWidget });
    const img = ctx.parentGroup.querySelector('img') as HTMLImageElement | null;
    expect(img?.getAttribute('src')).toBe('https://example.com/updated.png');
  });

  it('getSignals returns variableId when set, empty array otherwise', async () => {
    const { htmlImageMeta } = await import('../../../controls/batch3/html-image');
    const withVar = makeWidget({ property: { src: '', variableId: 'r1.IMG-0' } } as any);
    const withoutVar = makeWidget({ property: { src: '' } } as any);
    expect(htmlImageMeta.getSignals(withVar)).toEqual(['r1.IMG-0']);
    expect(htmlImageMeta.getSignals(withoutVar)).toEqual([]);
  });

  it('onUnmount removes foreignObject and is idempotent', async () => {
    const { htmlImageMeta } = await import('../../../controls/batch3/html-image');
    const ctx = makeCtx();
    const gauge = htmlImageMeta.create();
    gauge.onMount(makeWidget(), ctx);
    expect(ctx.parentGroup.childElementCount).toBe(1);
    gauge.onUnmount();
    expect(ctx.parentGroup.childElementCount).toBe(0);
    expect(() => gauge.onUnmount()).not.toThrow();
  });

  // SP-FX-48.21 phase 3: inline svgContent prop with sanitization
  it('svgContent renders inline SVG into a host div (not <img>)', async () => {
    const { htmlImageMeta } = await import('../../../controls/batch3/html-image');
    const ctx = makeCtx();
    const gauge = htmlImageMeta.create();
    gauge.onMount(makeWidget({
      property: {
        svgContent: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>',
      },
    } as any), ctx);
    const host = ctx.parentGroup.querySelector('[data-svg-host]') as HTMLDivElement | null;
    expect(host).not.toBeNull();
    expect(host?.querySelector('circle')).not.toBeNull();
    expect(ctx.parentGroup.querySelector('img')).toBeNull();
  });

  it('svgContent strips <script> elements (XSS guard)', async () => {
    const { htmlImageMeta } = await import('../../../controls/batch3/html-image');
    const ctx = makeCtx();
    const gauge = htmlImageMeta.create();
    gauge.onMount(makeWidget({
      property: {
        svgContent: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="10" height="10"/></svg>',
      },
    } as any), ctx);
    const host = ctx.parentGroup.querySelector('[data-svg-host]') as HTMLDivElement | null;
    expect(host?.querySelector('script')).toBeNull();
    expect(host?.querySelector('rect')).not.toBeNull();
  });

  it('svgContent strips on* event handler attributes', async () => {
    const { htmlImageMeta } = await import('../../../controls/batch3/html-image');
    const ctx = makeCtx();
    const gauge = htmlImageMeta.create();
    gauge.onMount(makeWidget({
      property: {
        svgContent: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" onclick="alert(1)" onload="x()"/></svg>',
      },
    } as any), ctx);
    const rect = ctx.parentGroup.querySelector('[data-svg-host] rect') as SVGRectElement | null;
    expect(rect).not.toBeNull();
    expect(rect?.hasAttribute('onclick')).toBe(false);
    expect(rect?.hasAttribute('onload')).toBe(false);
  });

  it('svgContent renames id attributes to widget-prefixed form (avoid collisions)', async () => {
    const { htmlImageMeta } = await import('../../../controls/batch3/html-image');
    const ctx = makeCtx();
    const gauge = htmlImageMeta.create();
    gauge.onMount(makeWidget({
      id: 'wImg1',
      property: {
        svgContent: '<svg xmlns="http://www.w3.org/2000/svg"><rect id="myBox" width="10" height="10"/></svg>',
      },
    } as any), ctx);
    const rect = ctx.parentGroup.querySelector('[data-svg-host] rect') as SVGRectElement | null;
    expect(rect?.getAttribute('id')).toBe('wImg1__myBox');
  });
});
