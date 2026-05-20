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

// SP-FX-FF.1.4: fixed 20px default per user feedback ("改成20px"). Explicit
// prop.fontSize still overrides. Bbox no longer drives font size.
const DEFAULT_FONT_SIZE = 20;
const PLACEHOLDER = '#.##';

function computeFontSize(prop: ValueProperty): number {
  if (typeof prop.fontSize === 'number' && prop.fontSize > 0) return prop.fontSize;
  return DEFAULT_FONT_SIZE;
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
    // SP-FX-FF.10: 'central' is more consistent across renderers than 'middle'
    // for vertical text alignment.
    el.setAttribute('dominant-baseline', 'central');
    el.setAttribute('font-size', String(computeFontSize(prop)));
    // SP-FX-FF.10: monospace font keeps "#.##" / numeric values width-uniform
    // so the eye reads the geometric middle as the perceived middle.
    el.setAttribute('font-family', 'ui-monospace, "SF Mono", Menlo, Consolas, monospace');
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
      this.textEl.setAttribute('font-size', String(computeFontSize(prop)));
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
  }

  private _render(v: GaugeValue): void {
    if (!this.textEl) return;
    const prop = this.widget.property as ValueProperty;

    if (v.isStale || v.value === null || v.value === undefined) {
      // SP-FX-FF.1.2: editor mode shows FUXA-style "#.##" placeholder so the
      // designer sees the widget shape at full size before binding a tag.
      // Runtime mode keeps the FUXA stale convention ("--").
      const placeholder = this.ctx.mode === 'editor'
        ? PLACEHOLDER
        : formatValue(null, prop.format, { decimals: prop.decimals, unit: prop.unit });
      this.textEl.textContent = placeholder;
      // SP-FX-FF.7: editor mode honors prop.color so the ColorPaletteBar gives
      // instant visual feedback on the placeholder. Runtime preserves the
      // muted FUXA stale convention (#9ca3af) regardless of designer color.
      const fill = this.ctx.mode === 'editor'
        ? (prop.color ?? '#9ca3af')
        : '#9ca3af';
      this.textEl.setAttribute('fill', fill);
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
