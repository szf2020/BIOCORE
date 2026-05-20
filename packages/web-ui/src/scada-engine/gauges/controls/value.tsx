// SP-FX-6: ValueGauge — display-only PLC tag value (FUXA svg-ext-value).
// SP-FX-48.19: FUXA fidelity upgrade — printf format, unit suffix, range.text
// override (range matched → render range.text instead of value), range.textColor,
// action system (blink/hide/show).

import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../gauge-base';
import type { FuxaWidget } from '../../models';
import {
  matchRange,
  applyActions,
  createActionRuntime,
  teardownActions,
  formatValue,
  type Range,
  type RangeAction,
  type ActionRuntime,
} from '../runtime-helpers';

interface ValueProperty {
  variableId?: string;
  format?: string;
  decimals?: number;
  unit?: string;
  color?: string;
  fontSize?: number;
  ranges?: Range[];
  actions?: RangeAction[];
}

// SP-FX-FF.1: auto font sizing — when prop.fontSize is absent, scale text to
// fill the widget bbox (FUXA fidelity). Height-driven (0.65 of h) with a
// width-clamp so common placeholders ("#.##") never overflow horizontally.
const AUTO_FONT_H_RATIO = 0.65;
const AUTO_FONT_W_CHAR = 0.55;
const AUTO_FONT_MIN = 6;
const AUTO_FONT_MAX = 400;
const PLACEHOLDER = '#.##';

function computeFontSize(prop: ValueProperty, w: number, h: number, sampleLen: number): number {
  if (typeof prop.fontSize === 'number' && prop.fontSize > 0) return prop.fontSize;
  const byHeight = h * AUTO_FONT_H_RATIO;
  const safeLen = Math.max(1, sampleLen);
  const byWidth = w / (safeLen * AUTO_FONT_W_CHAR);
  const px = Math.min(byHeight, byWidth);
  return Math.max(AUTO_FONT_MIN, Math.min(AUTO_FONT_MAX, Math.round(px)));
}

class ValueGauge implements GaugeBase {
  private textEl: SVGTextElement | null = null;
  private widget!: FuxaWidget;
  private ctx!: GaugeContext;
  private actionRt: ActionRuntime = createActionRuntime();

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    this.ctx = ctx;
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 80;
    const h = (widget as any).h ?? 40;
    const prop = widget.property as ValueProperty;
    el.setAttribute('x', String(x + w / 2));
    el.setAttribute('y', String(y + h / 2));
    el.setAttribute('text-anchor', 'middle');
    el.setAttribute('dominant-baseline', 'middle');
    el.setAttribute('font-size', String(computeFontSize(prop, w, h, PLACEHOLDER.length)));
    el.setAttribute('data-widget-id', widget.id);
    ctx.parentGroup.appendChild(el);
    this.textEl = el;
    const tagId = prop.variableId ?? '';
    this._render(tagId ? ctx.readValue(tagId) : { value: null, isStale: true });
  }

  onUnmount(): void {
    teardownActions(this.actionRt);
    this.textEl?.remove();
    this.textEl = null;
  }

  onProcess(value: GaugeValue): void {
    this._render(value);
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
    const prop = this.widget.property as ValueProperty;
    if (this.textEl) {
      const w = (this.widget as any).w ?? 80;
      const h = (this.widget as any).h ?? 40;
      const sampleLen = (this.textEl.textContent ?? PLACEHOLDER).length || PLACEHOLDER.length;
      this.textEl.setAttribute('font-size', String(computeFontSize(prop, w, h, sampleLen)));
    }
    const tagId = prop.variableId ?? '';
    this._render(tagId ? this.ctx.readValue(tagId) : { value: null, isStale: true });
  }

  onResize(w: number, h: number): void {
    if (!this.textEl) return;
    const x = (this.widget as any).x ?? 0;
    const y = (this.widget as any).y ?? 0;
    this.textEl.setAttribute('x', String(x + w / 2));
    this.textEl.setAttribute('y', String(y + h / 2));
    const prop = this.widget.property as ValueProperty;
    const sampleLen = (this.textEl.textContent ?? PLACEHOLDER).length || PLACEHOLDER.length;
    this.textEl.setAttribute('font-size', String(computeFontSize(prop, w, h, sampleLen)));
  }

  private _render(v: GaugeValue): void {
    if (!this.textEl) return;
    const prop = this.widget.property as ValueProperty;

    if (v.isStale || v.value === null || v.value === undefined) {
      this.textEl.textContent = formatValue(null, prop.format, { decimals: prop.decimals, unit: prop.unit });
      this.textEl.setAttribute('fill', '#9ca3af');
      applyActions(null, prop.actions, this.textEl, this.actionRt);
      return;
    }

    // Range match: if range.text is set, override the rendered string entirely.
    const range = matchRange(v.value, prop.ranges);
    let rendered: string;
    if (range && typeof range.text === 'string' && range.text.length > 0) {
      rendered = range.text;
    } else {
      rendered = formatValue(v.value, prop.format, { decimals: prop.decimals, unit: prop.unit });
    }
    this.textEl.textContent = rendered;
    this.textEl.setAttribute('fill', range?.textColor ?? prop.color ?? '#111827');
    applyActions(v.value, prop.actions, this.textEl, this.actionRt);
  }
}

export const valueMeta: GaugeMeta = {
  widgetType: 'svg-ext-value',
  create: () => new ValueGauge(),
  getSignals: (w) => {
    const v = (w.property as ValueProperty).variableId;
    return v ? [v] : [];
  },
};
