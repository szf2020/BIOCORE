// SP-FX-10 T6: ValveGauge — SVG valve state indicator + onClick WriteIntent.
// SVG pipe body rect + butterfly valve shape [data-valve-body], multi-state color.
// FUXA equivalent: svg-ext-valve

import type { GaugeBase, GaugeClickContext, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';
import { matchRange, applyActions, createActionRuntime, teardownActions, type Range, type RangeAction, type ActionRuntime } from '../../runtime-helpers';

interface ValveProperty {
  variableId?: string;
  openValue?: string;    // default '1'
  openColor?: string;    // default '#22c55e'
  closedColor?: string;  // default '#ef4444'
  ranges?: Range[];
  actions?: RangeAction[];
}

const STALE_COLOR = '#9ca3af';
const DEFAULT_OPEN_COLOR = '#22c55e';
const DEFAULT_CLOSED_COLOR = '#ef4444';

class ValveGauge implements GaugeBase {
  private valveBodyEl: SVGPolygonElement | null = null;
  private elements: SVGElement[] = [];
  private widget!: FuxaWidget;
  private ctx!: GaugeContext;
  private isOpen = false;
  private actionRt: ActionRuntime = createActionRuntime();

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    this.ctx = ctx;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 50;
    const h = (widget as any).h ?? 50;
    const prop = widget.property as ValveProperty;
    // SP-FX-FF.8: ColorPaletteBar (prop.color) acts as the designer's closed-state
    // color when no explicit closedColor is set, so the bar visibly paints valves.
    const designerColor = (prop as { color?: string }).color;
    const closedColor = prop.closedColor ?? designerColor ?? DEFAULT_CLOSED_COLOR;

    // Pipe body: horizontal rectangle in the center third
    const pipeH = h * 0.25;
    const pipeY = y + (h - pipeH) / 2;
    const pipe = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    pipe.setAttribute('x', String(x));
    pipe.setAttribute('y', String(pipeY));
    pipe.setAttribute('width', String(w));
    pipe.setAttribute('height', String(pipeH));
    pipe.setAttribute('fill', '#94a3b8');
    pipe.setAttribute('data-widget-id', widget.id);
    ctx.parentGroup.appendChild(pipe);
    this.elements.push(pipe);

    // Butterfly valve body: diamond/polygon shape in center
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w * 0.3;
    const ry = h * 0.35;
    const pts = [
      `${cx},${cy - ry}`,
      `${cx + rx},${cy}`,
      `${cx},${cy + ry}`,
      `${cx - rx},${cy}`,
    ].join(' ');
    const body = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    body.setAttribute('points', pts);
    body.setAttribute('fill', closedColor);
    body.setAttribute('stroke', '#1e293b');
    body.setAttribute('stroke-width', '1.5');
    body.setAttribute('data-valve-body', 'true');
    ctx.parentGroup.appendChild(body);
    this.valveBodyEl = body;
    this.elements.push(body);

    // Stem line (vertical from valve body to handle)
    const stemTopY = y + h * 0.05;
    const stemBottomY = cy - ry;
    if (stemBottomY > stemTopY + 1) {
      const stem = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      stem.setAttribute('x1', String(cx));
      stem.setAttribute('y1', String(stemBottomY));
      stem.setAttribute('x2', String(cx));
      stem.setAttribute('y2', String(stemTopY));
      stem.setAttribute('stroke', '#334155');
      stem.setAttribute('stroke-width', '2');
      stem.setAttribute('data-valve-stem', 'true');
      ctx.parentGroup.appendChild(stem);
      this.elements.push(stem);

      // Handle (horizontal bar at stem top)
      const handleW = w * 0.5;
      const handleH = h * 0.06;
      const handle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      handle.setAttribute('x', String(cx - handleW / 2));
      handle.setAttribute('y', String(stemTopY - handleH / 2));
      handle.setAttribute('width', String(handleW));
      handle.setAttribute('height', String(handleH));
      handle.setAttribute('fill', '#334155');
      handle.setAttribute('data-valve-handle', 'true');
      ctx.parentGroup.appendChild(handle);
      this.elements.push(handle);
    }
  }

  onUnmount(): void {
    teardownActions(this.actionRt);
    this.elements.forEach(el => el.remove());
    this.elements = [];
    this.valveBodyEl = null;
  }

  onProcess(value: GaugeValue): void {
    if (!this.valveBodyEl) return;
    const prop = this.widget.property as ValveProperty;

    if (value.isStale || value.value === null) {
      this.valveBodyEl.setAttribute('fill', STALE_COLOR);
      this.isOpen = false;
      return;
    }

    const openVal = prop.openValue ?? '1';
    this.isOpen = String(value.value) === openVal;
    let color = this.isOpen
      ? (prop.openColor ?? DEFAULT_OPEN_COLOR)
      : (prop.closedColor ?? DEFAULT_CLOSED_COLOR);

    // SP-FX-48.12: ranges → color override; actions → hide/show/blink
    const numVal = Number(value.value);
    const matched = matchRange(numVal, prop.ranges);
    if (matched?.color) color = matched.color;
    this.valveBodyEl.setAttribute('fill', color);
    applyActions(numVal, prop.actions, this.valveBodyEl, this.actionRt);
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
  }

  onResize(w: number, h: number): void {
    // Elements remain valid; full re-layout would require re-mount
    void w;
    void h;
  }

  onClick(_event: MouseEvent, _clickCtx: GaugeClickContext): void {
    if (this.ctx.mode !== 'runtime') return;
    const prop = this.widget.property as ValveProperty;
    if (!prop.variableId) return;
    // Toggle: if open -> write '0', if closed -> write '1'
    const nextValue = this.isOpen ? '0' : '1';
    this.ctx.onWriteIntent?.({ tag: prop.variableId, value: nextValue, widgetId: this.widget.id });
  }
}

export const valveMeta: GaugeMeta = {
  widgetType: 'svg-ext-valve',
  create: () => new ValveGauge(),
  getSignals: (w) => {
    const v = (w.property as ValveProperty).variableId;
    return v ? [v] : [];
  },
};
