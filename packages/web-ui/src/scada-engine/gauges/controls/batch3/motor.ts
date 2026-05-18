// SP-FX-9 T8: MotorGauge — SVG motor state indicator.
// Pure SVG circle with multi-state color switching.
// FUXA equivalent: svg-ext-motor

import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

interface MotorState {
  value: string;
  color: string;
  label?: string;
}

interface MotorProperty {
  variableId?: string;
  states?: MotorState[];
  defaultColor?: string;
}

const DEFAULT_COLOR = '#9ca3af';

class MotorGauge implements GaugeBase {
  private circleEl: SVGCircleElement | null = null;
  private elements: SVGElement[] = [];
  private widget!: FuxaWidget;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 50;
    const h = (widget as any).h ?? 50;
    const prop = widget.property as MotorProperty;
    const r = Math.min(w, h) / 2;
    const cx = x + w / 2;
    const cy = y + h / 2;

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(cx));
    circle.setAttribute('cy', String(cy));
    circle.setAttribute('r', String(r));
    circle.setAttribute('fill', prop.defaultColor ?? DEFAULT_COLOR);
    circle.setAttribute('data-widget-id', widget.id);
    ctx.parentGroup.appendChild(circle);
    this.circleEl = circle;
    this.elements = [circle];
  }

  onUnmount(): void {
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
    this.circleEl.setAttribute('fill', matched?.color ?? defaultColor);
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
