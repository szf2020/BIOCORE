// SP-FX-6.2: GaugeProgress — vertical progress bar scaled by value/range.
// FUXA equivalent: svg-ext-gauge_progress

import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

interface ProgressProperty {
  variableId?: string;
  min?: number;
  max?: number;
  barColor?: string;
  showLabel?: boolean;
}

const DEFAULT_BAR_COLOR = '#3F4964';

class GaugeProgress implements GaugeBase {
  private bgRect: SVGRectElement | null = null;
  private barRect: SVGRectElement | null = null;
  private labelEl: SVGTextElement | null = null;
  private widget!: FuxaWidget;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 40;
    const h = (widget as any).h ?? 100;
    const prop = widget.property as ProgressProperty;
    const barColor = prop.barColor ?? DEFAULT_BAR_COLOR;

    // Background rect
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', String(x));
    bg.setAttribute('y', String(y));
    bg.setAttribute('width', String(w));
    bg.setAttribute('height', String(h));
    bg.setAttribute('fill', '#e5e7eb');
    bg.setAttribute('data-widget-id', widget.id);
    ctx.parentGroup.appendChild(bg);
    this.bgRect = bg;

    // Bar rect (starts at bottom, height=0)
    const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bar.setAttribute('x', String(x));
    bar.setAttribute('y', String(y + h));
    bar.setAttribute('width', String(w));
    bar.setAttribute('height', '0');
    bar.setAttribute('fill', barColor);
    bar.setAttribute('data-bar', 'true');
    ctx.parentGroup.appendChild(bar);
    this.barRect = bar;

    // Optional label
    if (prop.showLabel) {
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(x + w / 2));
      label.setAttribute('y', String(y + h / 2));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'middle');
      label.setAttribute('font-size', '12');
      label.setAttribute('data-label', 'true');
      ctx.parentGroup.appendChild(label);
      this.labelEl = label;
    }
  }

  onUnmount(): void {
    this.bgRect?.remove();
    this.barRect?.remove();
    this.labelEl?.remove();
    this.bgRect = null;
    this.barRect = null;
    this.labelEl = null;
  }

  onProcess(value: GaugeValue): void {
    if (!this.barRect || !this.bgRect) return;
    const prop = this.widget.property as ProgressProperty;
    const min = prop.min ?? 0;
    const max = prop.max ?? 100;
    const bgY = parseFloat(this.bgRect.getAttribute('y') ?? '0');
    const totalH = parseFloat(this.bgRect.getAttribute('height') ?? '100');

    if (value.isStale || value.value === null) {
      this.barRect.setAttribute('height', '0');
      this.barRect.setAttribute('y', String(bgY + totalH));
      return;
    }

    let numVal = parseFloat(String(value.value));
    if (Number.isNaN(numVal)) numVal = min;
    const clamped = Math.min(Math.max(numVal, min), max);
    const ratio = max === min ? 0 : (clamped - min) / (max - min);
    const barH = ratio * totalH;
    this.barRect.setAttribute('height', String(barH));
    this.barRect.setAttribute('y', String(bgY + totalH - barH));

    if (this.labelEl) {
      this.labelEl.textContent = String(clamped);
    }
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
    const prop = this.widget.property as ProgressProperty;
    if (this.barRect && prop.barColor) {
      this.barRect.setAttribute('fill', prop.barColor);
    }
  }

  onResize(w: number, h: number): void {
    if (!this.bgRect || !this.barRect) return;
    const x = (this.widget as any).x ?? 0;
    const y = (this.widget as any).y ?? 0;
    this.bgRect.setAttribute('width', String(w));
    this.bgRect.setAttribute('height', String(h));
    this.bgRect.setAttribute('x', String(x));
    this.bgRect.setAttribute('y', String(y));
    this.barRect.setAttribute('width', String(w));
    this.barRect.setAttribute('x', String(x));
  }
}

export const gaugeProgressMeta: GaugeMeta = {
  widgetType: 'svg-ext-gauge_progress',
  create: () => new GaugeProgress(),
  getSignals: (w) => {
    const v = (w.property as ProgressProperty).variableId;
    return v ? [v] : [];
  },
};
