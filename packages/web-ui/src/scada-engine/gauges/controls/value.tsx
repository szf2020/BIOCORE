// SP-FX-6: ValueGauge — display-only PLC tag value (FUXA svg-ext-value).
// Pure SVG <text> element; no React, no foreignObject.

import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../gauge-base';
import type { FuxaWidget } from '../../models';

class ValueGauge implements GaugeBase {
  private textEl: SVGTextElement | null = null;
  private widget!: FuxaWidget;
  private ctx!: GaugeContext;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    this.ctx = ctx;
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 80;
    const h = (widget as any).h ?? 40;
    el.setAttribute('x', String(x + w / 2));
    el.setAttribute('y', String(y + h / 2));
    el.setAttribute('text-anchor', 'middle');
    el.setAttribute('dominant-baseline', 'middle');
    el.setAttribute('font-size', '14');
    el.setAttribute('data-widget-id', widget.id);
    ctx.parentGroup.appendChild(el);
    this.textEl = el;
    const tagId = (widget.property as { variableId?: string }).variableId ?? '';
    this._render(tagId ? ctx.readValue(tagId) : { value: null, isStale: true });
  }

  onUnmount(): void {
    this.textEl?.remove();
    this.textEl = null;
  }

  onProcess(value: GaugeValue): void {
    this._render(value);
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
    const tagId = (this.widget.property as { variableId?: string }).variableId ?? '';
    this._render(tagId ? this.ctx.readValue(tagId) : { value: null, isStale: true });
  }

  onResize(w: number, h: number): void {
    if (!this.textEl) return;
    const x = (this.widget as any).x ?? 0;
    const y = (this.widget as any).y ?? 0;
    this.textEl.setAttribute('x', String(x + w / 2));
    this.textEl.setAttribute('y', String(y + h / 2));
  }

  private _render(v: GaugeValue): void {
    if (!this.textEl) return;
    const prop = this.widget.property as { format?: string; decimals?: number; color?: string };
    const format = prop.format ?? '{value}';
    const display = v.isStale ? '--' : String(v.value ?? '--');
    this.textEl.textContent = format.replace('{value}', display);
    this.textEl.setAttribute('fill', v.isStale ? '#9ca3af' : (prop.color ?? '#111827'));
  }
}

export const valueMeta: GaugeMeta = {
  widgetType: 'svg-ext-value',
  create: () => new ValueGauge(),
  getSignals: (w) => {
    const v = (w.property as { variableId?: string }).variableId;
    return v ? [v] : [];
  },
};
