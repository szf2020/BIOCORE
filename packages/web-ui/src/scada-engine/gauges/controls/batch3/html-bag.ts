// SP-FX-9 T2: HtmlBagGauge — LED indicator using foreignObject + colored div.
// SP-FX-48.22 (phase 3 finale): displayMode='gauge' adds FUXA-style mini radial
// arc gauge (270° sweep, value fill, center numeric label). Backward compatible:
// default mode 'led' preserves the original LED behavior.
// FUXA equivalent: svg-ext-html_bag

import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';
import { matchRange, applyActions, createActionRuntime, teardownActions, type Range, type RangeAction, type ActionRuntime } from '../../runtime-helpers';

type DisplayMode = 'led' | 'gauge';

interface BagProperty {
  variableId?: string;
  displayMode?: DisplayMode;
  onColor?: string;
  offColor?: string;
  onValue?: string;
  shape?: 'circle' | 'rect';
  min?: number;
  max?: number;
  valueColor?: string;
  trackColor?: string;
  decimals?: number;
  unit?: string;
  ranges?: Range[];
  actions?: RangeAction[];
}

const STALE_COLOR = '#9ca3af';
const DEFAULT_ON_COLOR = '#22c55e';
const DEFAULT_OFF_COLOR = '#6b7280';
const DEFAULT_GAUGE_VALUE_COLOR = '#3b82f6';
const DEFAULT_GAUGE_TRACK_COLOR = '#e5e7eb';

function buildArcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startDeg));
  const y1 = cy + r * Math.sin(toRad(startDeg));
  const x2 = cx + r * Math.cos(toRad(endDeg));
  const y2 = cy + r * Math.sin(toRad(endDeg));
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

class HtmlBagGauge implements GaugeBase {
  private foEl: SVGForeignObjectElement | null = null;
  private divEl: HTMLDivElement | null = null;
  private trackPath: SVGPathElement | null = null;
  private valuePath: SVGPathElement | null = null;
  private labelEl: SVGTextElement | null = null;
  private bboxEl: SVGRectElement | null = null;
  private mode: DisplayMode = 'led';
  private widget!: FuxaWidget;
  private actionRt: ActionRuntime = createActionRuntime();

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    const prop = (widget.property ?? {}) as BagProperty;
    this.mode = prop.displayMode === 'gauge' ? 'gauge' : 'led';
    if (this.mode === 'gauge') this.mountGauge(widget, ctx);
    else this.mountLed(widget, ctx);
  }

  private mountLed(widget: FuxaWidget, ctx: GaugeContext): void {
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 40;
    const h = (widget as any).h ?? 40;
    const prop = widget.property as BagProperty;

    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', String(x));
    fo.setAttribute('y', String(y));
    fo.setAttribute('width', String(w));
    fo.setAttribute('height', String(h));
    fo.setAttribute('data-widget-id', widget.id);

    const div = document.createElement('div');
    // SP-FX-FF.8: ColorPaletteBar (prop.bgColor) drives the LED's off / idle
    // color when no explicit offColor was set, so the bar visibly paints bag widgets.
    const designerColor = (prop as { bgColor?: string }).bgColor;
    const offColor = prop.offColor ?? designerColor ?? DEFAULT_OFF_COLOR;
    div.style.width = '100%';
    div.style.height = '100%';
    div.style.backgroundColor = offColor;
    div.style.borderRadius = prop.shape === 'rect' ? '4px' : '50%';
    // SP-FX-48.24: editor mode → pointer-events:none so the widget can be dragged
    if (ctx.mode !== 'runtime') div.style.pointerEvents = 'none';
    div.dataset['color'] = offColor;
    fo.appendChild(div);
    ctx.parentGroup.appendChild(fo);

    this.foEl = fo;
    this.divEl = div;
  }

  private mountGauge(widget: FuxaWidget, ctx: GaugeContext): void {
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 80;
    const h = (widget as any).h ?? 80;
    const prop = widget.property as BagProperty;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(w, h) / 2 - 6;

    const bbox = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bbox.setAttribute('x', String(x));
    bbox.setAttribute('y', String(y));
    bbox.setAttribute('width', String(w));
    bbox.setAttribute('height', String(h));
    bbox.setAttribute('fill', 'transparent');
    bbox.setAttribute('pointer-events', 'all');
    bbox.setAttribute('data-widget-id', widget.id);
    ctx.parentGroup.appendChild(bbox);
    this.bboxEl = bbox;

    const track = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    track.setAttribute('d', buildArcPath(cx, cy, r, 135, 405));
    track.setAttribute('fill', 'none');
    // SP-FX-FF.8: gauge-mode track picks up prop.bgColor when explicit trackColor absent.
    track.setAttribute('stroke', prop.trackColor ?? (prop as { bgColor?: string }).bgColor ?? DEFAULT_GAUGE_TRACK_COLOR);
    track.setAttribute('stroke-width', String(Math.max(4, r * 0.18)));
    track.setAttribute('stroke-linecap', 'round');
    track.setAttribute('data-bag-track', 'true');
    ctx.parentGroup.appendChild(track);
    this.trackPath = track;

    const value = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    value.setAttribute('d', buildArcPath(cx, cy, r, 135, 135.01));
    value.setAttribute('fill', 'none');
    value.setAttribute('stroke', prop.valueColor ?? DEFAULT_GAUGE_VALUE_COLOR);
    value.setAttribute('stroke-width', String(Math.max(4, r * 0.18)));
    value.setAttribute('stroke-linecap', 'round');
    value.setAttribute('data-bag-value', 'true');
    ctx.parentGroup.appendChild(value);
    this.valuePath = value;

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(cx));
    label.setAttribute('y', String(cy));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'central');
    label.setAttribute('font-size', String(Math.max(10, r * 0.5)));
    label.setAttribute('font-weight', '600');
    label.setAttribute('fill', '#111827');
    label.setAttribute('data-bag-label', 'true');
    label.textContent = '--';
    ctx.parentGroup.appendChild(label);
    this.labelEl = label;
  }

  onUnmount(): void {
    teardownActions(this.actionRt);
    this.foEl?.remove();
    this.foEl = null;
    this.divEl = null;
    this.trackPath?.remove();
    this.valuePath?.remove();
    this.labelEl?.remove();
    this.bboxEl?.remove();
    this.trackPath = null;
    this.valuePath = null;
    this.labelEl = null;
    this.bboxEl = null;
  }

  onProcess(value: GaugeValue): void {
    if (this.mode === 'led') this.processLed(value);
    else this.processGauge(value);
  }

  private processLed(value: GaugeValue): void {
    if (!this.divEl) return;
    const prop = this.widget.property as BagProperty;
    if (value.isStale || value.value === null) {
      this.divEl.style.backgroundColor = STALE_COLOR;
      this.divEl.dataset['color'] = STALE_COLOR;
      return;
    }
    const onValue = prop.onValue ?? '1';
    const isOn = String(value.value) === onValue;
    let color = isOn
      ? (prop.onColor ?? DEFAULT_ON_COLOR)
      : (prop.offColor ?? DEFAULT_OFF_COLOR);

    const numVal = Number(value.value);
    const matched = matchRange(numVal, prop.ranges);
    if (matched?.color) color = matched.color;
    this.divEl.style.backgroundColor = color;
    this.divEl.dataset['color'] = color;
    applyActions(numVal, prop.actions, this.foEl, this.actionRt);
  }

  private processGauge(value: GaugeValue): void {
    if (!this.valuePath || !this.labelEl) return;
    const prop = this.widget.property as BagProperty;
    const x = (this.widget as any).x ?? 0;
    const y = (this.widget as any).y ?? 0;
    const w = (this.widget as any).w ?? 80;
    const h = (this.widget as any).h ?? 80;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(w, h) / 2 - 6;

    if (value.isStale || value.value === null) {
      this.labelEl.textContent = '--';
      this.valuePath.setAttribute('d', buildArcPath(cx, cy, r, 135, 135.01));
      this.valuePath.setAttribute('stroke', STALE_COLOR);
      return;
    }
    const numVal = parseFloat(String(value.value));
    if (Number.isNaN(numVal)) return;
    const min = prop.min ?? 0;
    const max = prop.max ?? 100;
    const clamped = Math.min(Math.max(numVal, min), max);
    const pct = max === min ? 0 : (clamped - min) / (max - min);
    const endDeg = 135 + 270 * pct;
    this.valuePath.setAttribute('d', buildArcPath(cx, cy, r, 135, endDeg));

    let color = prop.valueColor ?? DEFAULT_GAUGE_VALUE_COLOR;
    const matched = matchRange(numVal, prop.ranges);
    if (matched?.color) color = matched.color;
    this.valuePath.setAttribute('stroke', color);

    if (typeof prop.decimals === 'number') {
      let str = clamped.toFixed(prop.decimals);
      if (prop.unit) str += ' ' + prop.unit;
      this.labelEl.textContent = str;
    } else {
      this.labelEl.textContent = prop.unit ? `${clamped} ${prop.unit}` : String(clamped);
    }
    applyActions(numVal, prop.actions, this.valuePath as unknown as SVGElement, this.actionRt);
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
  }

  onResize(w: number, h: number): void {
    if (this.mode === 'led' && this.foEl) {
      this.foEl.setAttribute('width', String(w));
      this.foEl.setAttribute('height', String(h));
    }
  }
}

export const htmlBagMeta: GaugeMeta = {
  widgetType: 'svg-ext-html_bag',
  create: () => new HtmlBagGauge(),
  getSignals: (w) => {
    const v = (w.property as BagProperty).variableId;
    return v ? [v] : [];
  },
};
