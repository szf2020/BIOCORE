import { describe, it, expect, vi } from 'vitest';
import { htmlButtonMeta } from '../../controls/html-button';
import type { GaugeContext } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

const makeGroup = () => document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
const makeWidget = (property?: Record<string, unknown>): FuxaWidget => ({
  id: 'b1', type: 'svg-ext-html_button', property: property ?? {}, x: 0, y: 0, w: 100, h: 36,
});
const makeCtx = (overrides?: Partial<GaugeContext>): GaugeContext => ({
  parentGroup: makeGroup(),
  readValue: vi.fn().mockReturnValue({ value: 0, isStale: false }),
  canvasSize: { width: 800, height: 600 },
  mode: 'editor',
  ...overrides,
});

describe('HtmlButtonGauge (svg-ext-html_button)', () => {
  it('onMount creates <foreignObject> with <button> child in parentGroup', () => {
    const ctx = makeCtx();
    htmlButtonMeta.create().onMount(makeWidget({ label: '启动' }), ctx);
    const fo = ctx.parentGroup.querySelector('foreignObject');
    expect(fo).not.toBeNull();
    expect(fo!.querySelector('button')!.textContent).toContain('启动');
  });

  it('onProcess updates button backgroundColor from property.bgColor', () => {
    const ctx = makeCtx();
    const g = htmlButtonMeta.create();
    g.onMount(makeWidget({ label: '停止', bgColor: '#ff0000' }), ctx);
    g.onProcess({ value: 1, isStale: false });
    const btn = ctx.parentGroup.querySelector('button') as HTMLButtonElement;
    expect(btn.style.backgroundColor).toBe('rgb(255, 0, 0)');
  });

  it('onPropertyChange reflects updated label in button text', () => {
    const ctx = makeCtx();
    const g = htmlButtonMeta.create();
    const widget = makeWidget({ label: '旧' });
    g.onMount(widget, ctx);
    g.onPropertyChange({ key: 'label', value: '新', nextWidget: { ...widget, property: { ...widget.property, label: '新' } as any } });
    expect((ctx.parentGroup.querySelector('button') as HTMLButtonElement).textContent).toContain('新');
  });

  it('onClick in runtime mode calls ctx.onWriteIntent with correct payload', () => {
    const onWriteIntent = vi.fn();
    const ctx = makeCtx({ mode: 'runtime', onWriteIntent });
    const g = htmlButtonMeta.create();
    g.onMount(makeWidget({ events: [{ type: 'click', action: 'set-value', actparam: 'reactor1.AI-0', value: 1, requireConfirm: true }] }), ctx);
    (ctx.parentGroup.querySelector('button') as HTMLButtonElement).click();
    expect(onWriteIntent).toHaveBeenCalledWith({ tag: 'reactor1.AI-0', value: 1, widgetId: 'b1' });
  });

  it('onUnmount removes <foreignObject> from parentGroup', () => {
    const ctx = makeCtx();
    const g = htmlButtonMeta.create();
    g.onMount(makeWidget(), ctx);
    g.onUnmount();
    expect(ctx.parentGroup.querySelector('foreignObject')).toBeNull();
  });
});
