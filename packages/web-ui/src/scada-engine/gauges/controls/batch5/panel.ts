// SP-FX-48.7: Panel — container widget with background fill + optional border + title.
// FUXA equivalent: panel
// Pure presentational: no tag binding. Useful as visual grouping rectangle behind other widgets.

import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

interface PanelProperty {
  bgColor?: string;
  borderColor?: string;
  borderWidth?: number;
  title?: string;
  titleColor?: string;
}

class PanelGauge implements GaugeBase {
  private rectEl: SVGRectElement | null = null;
  private titleEl: SVGTextElement | null = null;
  private widget!: FuxaWidget;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 200;
    const h = (widget as any).h ?? 120;
    const prop = (widget.property ?? {}) as PanelProperty;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(w));
    rect.setAttribute('height', String(h));
    rect.setAttribute('fill', prop.bgColor ?? '#f8fafc');
    rect.setAttribute('stroke', prop.borderColor ?? '#cbd5e1');
    rect.setAttribute('stroke-width', String(prop.borderWidth ?? 1));
    rect.setAttribute('data-widget-id', widget.id);
    ctx.parentGroup.appendChild(rect);
    this.rectEl = rect;

    if (prop.title) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(x + 8));
      text.setAttribute('y', String(y + 18));
      text.setAttribute('fill', prop.titleColor ?? '#0f172a');
      text.setAttribute('font-size', '13');
      text.setAttribute('font-weight', '600');
      text.textContent = prop.title;
      ctx.parentGroup.appendChild(text);
      this.titleEl = text;
    }
  }

  onUnmount(): void {
    this.rectEl?.remove();
    this.titleEl?.remove();
    this.rectEl = null;
    this.titleEl = null;
  }

  onProcess(_value: GaugeValue): void {
    // No-op: panel has no tag binding
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
  }

  onResize(w: number, h: number): void {
    this.rectEl?.setAttribute('width', String(w));
    this.rectEl?.setAttribute('height', String(h));
  }
}

export const panelMeta: GaugeMeta = {
  widgetType: 'svg-ext-panel',
  create: () => new PanelGauge(),
  getSignals: (_w) => [],
};
