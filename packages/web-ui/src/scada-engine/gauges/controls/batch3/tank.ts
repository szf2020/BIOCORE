// SP-FX-9 T6: TankGauge — SVG liquid level tank.
// Pure SVG rect + data-fill rect, bottom-up fill animation.
// FUXA equivalent: svg-ext-tank

import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';
import { matchRange, applyActions, createActionRuntime, teardownActions, type Range, type RangeAction, type ActionRuntime } from '../../runtime-helpers';

interface TankProperty {
  variableId?: string;
  min?: number;
  max?: number;
  fillColor?: string;
  bgColor?: string;
  showLabel?: boolean;
  ranges?: Range[];
  actions?: RangeAction[];
}

const DEFAULT_FILL_COLOR = '#3b82f6';
const DEFAULT_BG_COLOR = '#e2e8f0';

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

class TankGauge implements GaugeBase {
  private bgRect: SVGRectElement | null = null;
  private fillRect: SVGRectElement | null = null;
  private labelEl: SVGTextElement | null = null;
  private tickEls: SVGLineElement[] = [];
  private widget!: FuxaWidget;
  private actionRt: ActionRuntime = createActionRuntime();

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 60;
    const h = (widget as any).h ?? 100;
    const prop = widget.property as TankProperty;

    // Background rect with P&ID-style outline
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', String(x));
    bg.setAttribute('y', String(y));
    bg.setAttribute('width', String(w));
    bg.setAttribute('height', String(h));
    bg.setAttribute('fill', prop.bgColor ?? DEFAULT_BG_COLOR);
    bg.setAttribute('stroke', '#475569');
    bg.setAttribute('stroke-width', '2');
    bg.setAttribute('rx', '4');
    bg.setAttribute('data-widget-id', widget.id);
    ctx.parentGroup.appendChild(bg);
    this.bgRect = bg;

    // Fill rect (starts at 0 height at bottom)
    const fill = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    fill.setAttribute('x', String(x));
    fill.setAttribute('y', String(y + h));
    fill.setAttribute('width', String(w));
    fill.setAttribute('height', '0');
    fill.setAttribute('fill', prop.fillColor ?? DEFAULT_FILL_COLOR);
    fill.setAttribute('data-fill', 'true');
    ctx.parentGroup.appendChild(fill);
    this.fillRect = fill;

    // Right-side scale tick marks (3 ticks: 25%, 50%, 75%)
    this.tickEls = [];
    for (const pct of [0.25, 0.5, 0.75]) {
      const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      tick.setAttribute('x1', String(x + w - 6));
      tick.setAttribute('y1', String(y + h * (1 - pct)));
      tick.setAttribute('x2', String(x + w));
      tick.setAttribute('y2', String(y + h * (1 - pct)));
      tick.setAttribute('stroke', '#475569');
      tick.setAttribute('stroke-width', '1');
      tick.setAttribute('data-tick', String(pct));
      ctx.parentGroup.appendChild(tick);
      this.tickEls.push(tick);
    }

    // Label text
    if (prop.showLabel !== false) {
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(x + w / 2));
      label.setAttribute('y', String(y + h / 2));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'middle');
      label.setAttribute('font-size', '11');
      label.setAttribute('fill', '#1e293b');
      label.setAttribute('data-label', 'true');
      label.textContent = '';
      ctx.parentGroup.appendChild(label);
      this.labelEl = label;
    }
  }

  onUnmount(): void {
    teardownActions(this.actionRt);
    this.bgRect?.remove();
    this.fillRect?.remove();
    this.labelEl?.remove();
    this.tickEls.forEach((t) => t.remove());
    this.tickEls = [];
    this.bgRect = null;
    this.fillRect = null;
    this.labelEl = null;
  }

  onProcess(value: GaugeValue): void {
    if (!this.fillRect) return;
    const prop = this.widget.property as TankProperty;
    const min = prop.min ?? 0;
    const max = prop.max ?? 100;
    const h = parseFloat(this.bgRect?.getAttribute('height') ?? '100');
    const y = parseFloat(this.bgRect?.getAttribute('y') ?? '0');

    if (value.isStale || value.value === null) {
      this.fillRect.setAttribute('height', '0');
      this.fillRect.setAttribute('y', String(y + h));
      if (this.labelEl) this.labelEl.textContent = '';
      return;
    }

    const numVal = parseFloat(String(value.value));
    if (Number.isNaN(numVal)) return;
    const pct = clamp((numVal - min) / (max - min || 1), 0, 1);
    const fillH = pct * h;
    this.fillRect.setAttribute('height', String(fillH));
    this.fillRect.setAttribute('y', String(y + h - fillH));

    if (this.labelEl) {
      this.labelEl.textContent = String(Math.round(numVal));
    }

    // SP-FX-48.12: ranges → fill color override; actions → hide/show/blink on bg
    const matched = matchRange(numVal, prop.ranges);
    if (matched?.color) this.fillRect.setAttribute('fill', matched.color);
    else if (prop.fillColor) this.fillRect.setAttribute('fill', prop.fillColor);
    applyActions(numVal, prop.actions, this.bgRect, this.actionRt);
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
    const prop = this.widget.property as TankProperty;
    if (this.bgRect && prop.bgColor) {
      this.bgRect.setAttribute('fill', prop.bgColor);
    }
    if (this.fillRect && prop.fillColor) {
      this.fillRect.setAttribute('fill', prop.fillColor);
    }
  }

  onResize(w: number, h: number): void {
    if (!this.bgRect || !this.fillRect) return;
    this.bgRect.setAttribute('width', String(w));
    this.bgRect.setAttribute('height', String(h));
  }
}

export const tankMeta: GaugeMeta = {
  widgetType: 'svg-ext-tank',
  create: () => new TankGauge(),
  getSignals: (w) => {
    const v = (w.property as TankProperty).variableId;
    return v ? [v] : [];
  },
};
