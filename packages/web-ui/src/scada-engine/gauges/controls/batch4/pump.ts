// SP-FX-10 T8: PumpGauge — SVG pump state indicator with blade segments.
// Outer circle (pump casing) + N fan blade paths [data-blade], multi-state color switching.
// FUXA equivalent: svg-ext-pump

import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';
import { matchRange, applyActions, createActionRuntime, teardownActions, type Range, type RangeAction, type ActionRuntime } from '../../runtime-helpers';

interface PumpState {
  value: string;
  color: string;
}

interface PumpProperty {
  variableId?: string;
  states?: PumpState[];
  defaultColor?: string;
  bladeCount?: number;
  ranges?: Range[];
  actions?: RangeAction[];
}

const DEFAULT_COLOR = '#9ca3af';
const DEFAULT_BLADE_COUNT = 3;

function makeBladePath(cx: number, cy: number, r: number, angleStart: number, angleEnd: number): string {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const x2 = cx + r * Math.cos(toRad(angleStart));
  const y2 = cy + r * Math.sin(toRad(angleStart));
  const x3 = cx + r * Math.cos(toRad(angleEnd));
  const y3 = cy + r * Math.sin(toRad(angleEnd));
  return `M ${cx} ${cy} L ${x2} ${y2} A ${r} ${r} 0 0 1 ${x3} ${y3} Z`;
}

class PumpGauge implements GaugeBase {
  private outerCircle: SVGCircleElement | null = null;
  private bladeEls: SVGPathElement[] = [];
  private elements: SVGElement[] = [];
  private widget!: FuxaWidget;
  private actionRt: ActionRuntime = createActionRuntime();

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 60;
    const h = (widget as any).h ?? 60;
    const prop = widget.property as PumpProperty;
    const defaultColor = prop.defaultColor ?? DEFAULT_COLOR;
    const bladeCount = prop.bladeCount ?? DEFAULT_BLADE_COUNT;

    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(w, h) / 2;

    // Top inlet stub + right outlet stub (P&ID centrifugal pump nozzles)
    const stubW = r * 0.3;
    const stubL = r * 0.35;
    const inletStub = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    inletStub.setAttribute('x', String(cx - stubW / 2));
    inletStub.setAttribute('y', String(cy - r - stubL));
    inletStub.setAttribute('width', String(stubW));
    inletStub.setAttribute('height', String(stubL));
    inletStub.setAttribute('fill', '#475569');
    inletStub.setAttribute('data-inlet', 'true');
    ctx.parentGroup.appendChild(inletStub);
    this.elements.push(inletStub);

    const outletStub = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    outletStub.setAttribute('x', String(cx + r));
    outletStub.setAttribute('y', String(cy - stubW / 2));
    outletStub.setAttribute('width', String(stubL));
    outletStub.setAttribute('height', String(stubW));
    outletStub.setAttribute('fill', '#475569');
    outletStub.setAttribute('data-outlet', 'true');
    ctx.parentGroup.appendChild(outletStub);
    this.elements.push(outletStub);

    // Outer circle: pump casing
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(cx));
    circle.setAttribute('cy', String(cy));
    circle.setAttribute('r', String(r));
    circle.setAttribute('fill', '#334155');
    circle.setAttribute('data-widget-id', widget.id);
    ctx.parentGroup.appendChild(circle);
    this.outerCircle = circle;
    this.elements.push(circle);

    // Blade segments (fan wedges)
    const angleStep = 360 / bladeCount;
    const innerR = r * 0.85;
    this.bladeEls = [];
    for (let i = 0; i < bladeCount; i++) {
      const aStart = i * angleStep + 5;
      const aEnd = (i + 1) * angleStep - 5;
      const d = makeBladePath(cx, cy, innerR, aStart, aEnd);
      const blade = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      blade.setAttribute('d', d);
      blade.setAttribute('fill', defaultColor);
      blade.setAttribute('data-blade', String(i));
      ctx.parentGroup.appendChild(blade);
      this.bladeEls.push(blade);
      this.elements.push(blade);
    }
  }

  onUnmount(): void {
    teardownActions(this.actionRt);
    this.elements.forEach(el => el.remove());
    this.elements = [];
    this.outerCircle = null;
    this.bladeEls = [];
  }

  onProcess(value: GaugeValue): void {
    if (this.bladeEls.length === 0) return;
    const prop = this.widget.property as PumpProperty;
    const defaultColor = prop.defaultColor ?? DEFAULT_COLOR;

    let color: string;
    if (value.isStale || value.value === null) {
      color = defaultColor;
    } else {
      const strVal = String(value.value);
      const matched = (prop.states ?? []).find(s => s.value === strVal);
      color = matched?.color ?? defaultColor;
    }

    // SP-FX-48.12: ranges → color override; actions → hide/show/blink on outer
    const numVal = Number(value.value);
    const rangeMatched = matchRange(numVal, prop.ranges);
    if (rangeMatched?.color) color = rangeMatched.color;
    for (const blade of this.bladeEls) {
      blade.setAttribute('fill', color);
    }
    applyActions(numVal, prop.actions, this.outerCircle, this.actionRt);
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
  }

  onResize(_w: number, _h: number): void {
    // No-op: full re-layout would require re-mount
  }
}

export const pumpMeta: GaugeMeta = {
  widgetType: 'svg-ext-pump',
  create: () => new PumpGauge(),
  getSignals: (w) => {
    const v = (w.property as PumpProperty).variableId;
    return v ? [v] : [];
  },
};
