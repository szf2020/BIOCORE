// SP-FX-6: HtmlButtonGauge — click → ctx.onWriteIntent (runtime only).
// Renders <foreignObject><button> in the SVG group.

import type { GaugeBase, GaugeContext, GaugeClickContext, GaugeMeta, GaugePropChange, GaugeValue } from '../gauge-base';
import type { FuxaWidget } from '../../models';

class HtmlButtonGauge implements GaugeBase {
  private foreignObj: SVGForeignObjectElement | null = null;
  private htmlBtn: HTMLButtonElement | null = null;
  private widget!: FuxaWidget;
  private ctx!: GaugeContext;
  private clickHandler: (() => void) | null = null;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    this.ctx = ctx;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 100;
    const h = (widget as any).h ?? 36;

    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', String(x));
    fo.setAttribute('y', String(y));
    fo.setAttribute('width', String(w));
    fo.setAttribute('height', String(h));
    fo.setAttribute('data-widget-id', widget.id);

    const btn = document.createElement('button');
    btn.style.width = '100%';
    btn.style.height = '100%';
    btn.style.cursor = ctx.mode === 'runtime' ? 'pointer' : 'default';
    const prop = widget.property as { label?: string; bgColor?: string; textColor?: string };
    btn.textContent = prop.label ?? '';
    if (prop.bgColor) btn.style.backgroundColor = prop.bgColor;
    if (prop.textColor) btn.style.color = prop.textColor;

    this.clickHandler = () => {
      if (this.ctx.mode !== 'runtime') return;
      const prop = this.widget.property as any;
      const events = prop.events ?? [];
      const evt = events.find((x: any) => x?.type === 'click');
      // SP-FX-48.9: prefer FUXA-style events array; fall back to schema flat keys
      const tag = evt?.actparam ?? prop.variableId;
      const value = evt?.value ?? prop.writeValue;
      if (!tag) return;
      this.ctx.onWriteIntent?.({ tag, value, widgetId: this.widget.id });
    };
    btn.addEventListener('click', this.clickHandler);
    fo.appendChild(btn);
    ctx.parentGroup.appendChild(fo);
    this.foreignObj = fo;
    this.htmlBtn = btn;
  }

  onUnmount(): void {
    if (this.htmlBtn && this.clickHandler) this.htmlBtn.removeEventListener('click', this.clickHandler);
    this.foreignObj?.remove();
    this.foreignObj = null;
    this.htmlBtn = null;
    this.clickHandler = null;
  }

  onProcess(_value: GaugeValue): void {
    if (!this.htmlBtn) return;
    const prop = this.widget.property as { bgColor?: string };
    if (prop.bgColor) this.htmlBtn.style.backgroundColor = prop.bgColor;
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
    if (!this.htmlBtn) return;
    const prop = this.widget.property as { label?: string; bgColor?: string; textColor?: string };
    if (prop.label !== undefined) this.htmlBtn.textContent = prop.label;
    if (prop.bgColor) this.htmlBtn.style.backgroundColor = prop.bgColor;
    if (prop.textColor) this.htmlBtn.style.color = prop.textColor;
  }

  onResize(w: number, h: number): void {
    if (!this.foreignObj) return;
    this.foreignObj.setAttribute('width', String(w));
    this.foreignObj.setAttribute('height', String(h));
  }

  onClick(_e: MouseEvent, c: GaugeClickContext): void {
    if (c.ctx.mode !== 'runtime') return;
    const prop = c.widget.property as any;
    const events = prop.events ?? [];
    const evt = events.find((x: any) => x?.type === 'click');
    // SP-FX-48.9: prefer events[], fall back to flat variableId + writeValue
    const tag = evt?.actparam ?? prop.variableId;
    const value = evt?.value ?? prop.writeValue;
    if (!tag) return;
    c.ctx.onWriteIntent?.({ tag, value, widgetId: c.widget.id });
  }
}

export const htmlButtonMeta: GaugeMeta = {
  widgetType: 'svg-ext-html_button',
  create: () => new HtmlButtonGauge(),
  getSignals: (w) => {
    const v = (w.property as { variableId?: string }).variableId;
    return v ? [v] : [];
  },
};
