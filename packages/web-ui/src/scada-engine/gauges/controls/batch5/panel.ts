// SP-FX-48.7: Panel — container widget with background fill + optional border + title.
// SP-FX-48.22 (phase 3 finale): viewName prop binds the panel to a child HMI
// view. In editor mode the panel renders a clearly-marked placeholder so the
// designer can lay it out; runtime mounting of the nested view is the host's
// responsibility (RuntimeCanvas observes data-nested-view attr and mounts a
// child canvas there).
// FUXA equivalent: panel

import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

interface PanelProperty {
  bgColor?: string;
  borderColor?: string;
  borderWidth?: number;
  title?: string;
  titleColor?: string;
  viewName?: string;
}

class PanelGauge implements GaugeBase {
  private rectEl: SVGRectElement | null = null;
  private titleEl: SVGTextElement | null = null;
  private nestedMarkerEl: SVGTextElement | null = null;
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
    if (prop.viewName) {
      rect.setAttribute('data-nested-view', prop.viewName);
      rect.setAttribute('stroke-dasharray', '4 2');
    }
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

    if (prop.viewName && ctx.mode !== 'runtime') {
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      marker.setAttribute('x', String(x + w / 2));
      marker.setAttribute('y', String(y + h / 2));
      marker.setAttribute('text-anchor', 'middle');
      marker.setAttribute('dominant-baseline', 'central');
      marker.setAttribute('font-size', '12');
      marker.setAttribute('font-family', 'sans-serif');
      marker.setAttribute('fill', '#64748b');
      marker.setAttribute('data-panel-nested-marker', 'true');
      marker.textContent = `[嵌入视图: ${prop.viewName}]`;
      ctx.parentGroup.appendChild(marker);
      this.nestedMarkerEl = marker;
    }
  }

  onUnmount(): void {
    this.rectEl?.remove();
    this.titleEl?.remove();
    this.nestedMarkerEl?.remove();
    this.rectEl = null;
    this.titleEl = null;
    this.nestedMarkerEl = null;
  }

  onProcess(_value: GaugeValue): void {
    // panel has no tag binding; nested view (if any) drives itself
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
    if (!this.rectEl) return;
    const prop = this.widget.property as PanelProperty;
    if (prop.bgColor) this.rectEl.setAttribute('fill', prop.bgColor);
    if (prop.borderColor) this.rectEl.setAttribute('stroke', prop.borderColor);
    if (typeof prop.borderWidth === 'number') {
      this.rectEl.setAttribute('stroke-width', String(prop.borderWidth));
    }
    if (prop.viewName) {
      this.rectEl.setAttribute('data-nested-view', prop.viewName);
      this.rectEl.setAttribute('stroke-dasharray', '4 2');
      if (this.nestedMarkerEl) this.nestedMarkerEl.textContent = `[嵌入视图: ${prop.viewName}]`;
    } else {
      this.rectEl.removeAttribute('data-nested-view');
      this.rectEl.removeAttribute('stroke-dasharray');
      this.nestedMarkerEl?.remove();
      this.nestedMarkerEl = null;
    }
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
