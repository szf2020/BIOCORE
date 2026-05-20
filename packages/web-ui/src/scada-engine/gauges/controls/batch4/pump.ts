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

// SP-FX-FF.34: FUXA-style turbine pump — many thin radial blades + small
// inner hub + outline-only casing (no fill), matching the industrial impeller
// glyph rather than a 3-slice pie chart.
const DEFAULT_COLOR = '#1f2937';
const DEFAULT_BLADE_COUNT = 14;
const HUB_RATIO = 0.25;     // inner hub radius / casing radius
const BLADE_INNER_RATIO = 0.32; // blade inner edge / casing radius (slight gap from hub)
const BLADE_WIDTH = 3;      // pixel thickness of each blade rectangle

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
    // SP-FX-FF.8: ColorPaletteBar (prop.color) provides designer fallback.
    const defaultColor = prop.defaultColor ?? (prop as { color?: string }).color ?? DEFAULT_COLOR;
    const bladeCount = prop.bladeCount ?? DEFAULT_BLADE_COUNT;

    // SP-FX-FF.32: pump casing is now CENTERED in bbox; stubs extend from
    // the casing edge to the top + right bbox edges. Previous layout anchored
    // the casing to bottom-left so wide bboxes left large empty corners.
    const stubL = Math.min(h, w) * 0.2;
    const r = Math.min(w - 2 * stubL, h - 2 * stubL) / 2;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const stubW = r * 0.5;

    const inletStub = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    inletStub.setAttribute('x', String(cx - stubW / 2));
    inletStub.setAttribute('y', String(y));
    inletStub.setAttribute('width', String(stubW));
    // SP-FX-FF.32: stub extends from bbox top down to casing top edge.
    inletStub.setAttribute('height', String(Math.max(0, cy - r - y)));
    inletStub.setAttribute('fill', '#475569');
    inletStub.setAttribute('data-inlet', 'true');
    ctx.parentGroup.appendChild(inletStub);
    this.elements.push(inletStub);

    const outletStub = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    outletStub.setAttribute('x', String(cx + r));
    outletStub.setAttribute('y', String(cy - stubW / 2));
    outletStub.setAttribute('width', String(Math.max(0, x + w - (cx + r))));
    outletStub.setAttribute('height', String(stubW));
    outletStub.setAttribute('fill', '#475569');
    outletStub.setAttribute('data-outlet', 'true');
    ctx.parentGroup.appendChild(outletStub);
    this.elements.push(outletStub);

    // SP-FX-FF.34: outline-only casing (no fill) — FUXA turbine pump look.
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(cx));
    circle.setAttribute('cy', String(cy));
    circle.setAttribute('r', String(r));
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', defaultColor);
    circle.setAttribute('stroke-width', '1.5');
    circle.setAttribute('data-widget-id', widget.id);
    ctx.parentGroup.appendChild(circle);
    this.outerCircle = circle;
    this.elements.push(circle);

    // SP-FX-FF.34: inner hub
    const hub = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    hub.setAttribute('cx', String(cx));
    hub.setAttribute('cy', String(cy));
    hub.setAttribute('r', String(r * HUB_RATIO));
    hub.setAttribute('fill', 'none');
    hub.setAttribute('stroke', defaultColor);
    hub.setAttribute('stroke-width', '1.5');
    hub.setAttribute('data-pump-hub', 'true');
    ctx.parentGroup.appendChild(hub);
    this.elements.push(hub);

    // SP-FX-FF.34: thin radial blades (rectangles rotated around hub center).
    const angleStep = 360 / bladeCount;
    const bladeInnerR = r * BLADE_INNER_RATIO;
    const bladeLen = r - bladeInnerR;
    this.bladeEls = [];
    for (let i = 0; i < bladeCount; i++) {
      const angle = i * angleStep;
      const blade = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      // Centered at (cx, cy), then translated outward and rotated.
      blade.setAttribute('x', String(bladeInnerR));
      blade.setAttribute('y', String(-BLADE_WIDTH / 2));
      blade.setAttribute('width', String(bladeLen));
      blade.setAttribute('height', String(BLADE_WIDTH));
      blade.setAttribute('fill', defaultColor);
      blade.setAttribute('transform', `translate(${cx} ${cy}) rotate(${angle})`);
      blade.setAttribute('data-blade', String(i));
      ctx.parentGroup.appendChild(blade);
      this.bladeEls.push(blade as unknown as SVGPathElement);
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
