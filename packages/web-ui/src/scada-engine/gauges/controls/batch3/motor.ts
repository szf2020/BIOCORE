// SP-FX-9 T8: MotorGauge — SVG motor state indicator.
// Pure SVG circle with multi-state color switching.
// FUXA equivalent: svg-ext-motor

import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';
import { matchRange, applyActions, createActionRuntime, teardownActions, type Range, type RangeAction, type ActionRuntime } from '../../runtime-helpers';

interface MotorState {
  value: string;
  color: string;
  label?: string;
}

interface MotorProperty {
  variableId?: string;
  states?: MotorState[];
  defaultColor?: string;
  ranges?: Range[];
  actions?: RangeAction[];
}

const DEFAULT_COLOR = '#9ca3af';

class MotorGauge implements GaugeBase {
  private circleEl: SVGCircleElement | null = null;
  private elements: SVGElement[] = [];
  private widget!: FuxaWidget;
  private actionRt: ActionRuntime = createActionRuntime();

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 50;
    const h = (widget as any).h ?? 50;
    const prop = widget.property as MotorProperty;
    // SP-FX-48.24: reserve top strip for terminal stubs so all geometry stays
    // within the widget bbox (selection chrome aligns to widget x/y/w/h).
    const termH = Math.min(h * 0.18, 12);
    const r = Math.min(w / 2, (h - termH) / 2);
    const cx = x + w / 2;
    const cy = y + termH + r;

    const termW = Math.max(4, r * 0.18);
    for (const offset of [-r * 0.4, r * 0.4]) {
      const term = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      term.setAttribute('x', String(cx + offset - termW / 2));
      term.setAttribute('y', String(y));
      term.setAttribute('width', String(termW));
      term.setAttribute('height', String(termH));
      term.setAttribute('fill', '#334155');
      term.setAttribute('data-terminal', 'true');
      ctx.parentGroup.appendChild(term);
      this.elements.push(term);
    }

    // Main body circle (color = state indicator)
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(cx));
    circle.setAttribute('cy', String(cy));
    circle.setAttribute('r', String(r));
    circle.setAttribute('fill', prop.defaultColor ?? DEFAULT_COLOR);
    circle.setAttribute('stroke', '#334155');
    circle.setAttribute('stroke-width', '2');
    circle.setAttribute('data-widget-id', widget.id);
    ctx.parentGroup.appendChild(circle);
    this.circleEl = circle;
    this.elements.push(circle);

    // "M" label in center (P&ID motor symbol)
    const mText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    mText.setAttribute('x', String(cx));
    mText.setAttribute('y', String(cy));
    mText.setAttribute('text-anchor', 'middle');
    mText.setAttribute('dominant-baseline', 'central');
    mText.setAttribute('font-size', String(Math.max(10, r * 0.9)));
    mText.setAttribute('font-weight', 'bold');
    mText.setAttribute('font-family', 'sans-serif');
    mText.setAttribute('fill', '#ffffff');
    mText.setAttribute('data-motor-label', 'true');
    mText.textContent = 'M';
    ctx.parentGroup.appendChild(mText);
    this.elements.push(mText);
  }

  onUnmount(): void {
    teardownActions(this.actionRt);
    this.elements.forEach(el => el.remove());
    this.elements = [];
    this.circleEl = null;
  }

  onProcess(value: GaugeValue): void {
    if (!this.circleEl) return;
    const prop = this.widget.property as MotorProperty;
    const defaultColor = prop.defaultColor ?? DEFAULT_COLOR;

    if (value.isStale || value.value === null) {
      this.circleEl.setAttribute('fill', defaultColor);
      return;
    }

    const strVal = String(value.value);
    const matched = (prop.states ?? []).find(s => s.value === strVal);
    let color = matched?.color ?? defaultColor;

    // SP-FX-48.12: ranges → color override; actions → hide/show/blink
    const numVal = Number(value.value);
    const rangeMatched = matchRange(numVal, prop.ranges);
    if (rangeMatched?.color) color = rangeMatched.color;
    this.circleEl.setAttribute('fill', color);
    applyActions(numVal, prop.actions, this.circleEl, this.actionRt);
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
  }

  onResize(w: number, h: number): void {
    if (!this.circleEl) return;
    const x = (this.widget as any).x ?? 0;
    const y = (this.widget as any).y ?? 0;
    const r = Math.min(w, h) / 2;
    this.circleEl.setAttribute('cx', String(x + w / 2));
    this.circleEl.setAttribute('cy', String(y + h / 2));
    this.circleEl.setAttribute('r', String(r));
  }
}

export const motorMeta: GaugeMeta = {
  widgetType: 'svg-ext-motor',
  create: () => new MotorGauge(),
  getSignals: (w) => {
    const v = (w.property as MotorProperty).variableId;
    return v ? [v] : [];
  },
};
