// SP-FX-9 T4: HtmlGraphGauge — native canvas trend line chart.
// FUXA equivalent: svg-ext-html_graph
// ZERO third-party chart dependencies.

import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';
import { matchRange, applyActions, createActionRuntime, teardownActions, type Range, type RangeAction, type ActionRuntime } from '../../runtime-helpers';

type GraphChartType = 'line' | 'bar';

interface GraphProperty {
  variableId?: string;
  // SP-FX-48.19: FUXA chartType enum (line/bar). Pie omitted: single-tag pie
  // is a gauge, not a chart — use svg-ext-gauge_progress for that.
  chartType?: GraphChartType;
  maxPoints?: number;
  lineColor?: string;
  bgColor?: string;
  minVal?: number;
  maxVal?: number;
  ranges?: Range[];
  actions?: RangeAction[];
}

const DEFAULT_MAX_POINTS = 60;
const DEFAULT_LINE_COLOR = '#3b82f6';
const DEFAULT_BG_COLOR = '#1e293b';
const DEFAULT_MIN = 0;
const DEFAULT_MAX = 100;

class HtmlGraphGauge implements GaugeBase {
  private foEl: SVGForeignObjectElement | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private buffer: number[] = [];
  private maxPoints = DEFAULT_MAX_POINTS;
  private widget!: FuxaWidget;
  private actionRt: ActionRuntime = createActionRuntime();
  private lastRangeColor: string | null = null;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 200;
    const h = (widget as any).h ?? 100;
    const prop = widget.property as GraphProperty;
    this.maxPoints = prop.maxPoints ?? DEFAULT_MAX_POINTS;
    this.buffer = [];

    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', String(x));
    fo.setAttribute('y', String(y));
    fo.setAttribute('width', String(w));
    fo.setAttribute('height', String(h));
    fo.setAttribute('data-widget-id', widget.id);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    // SP-FX-48.24: editor mode → pointer-events:none so the widget can be dragged
    if (ctx.mode !== 'runtime') canvas.style.pointerEvents = 'none';
    canvas.dataset['pointCount'] = '0';
    fo.appendChild(canvas);
    ctx.parentGroup.appendChild(fo);

    this.foEl = fo;
    this.canvasEl = canvas;
    this._draw();
  }

  onUnmount(): void {
    teardownActions(this.actionRt);
    this.foEl?.remove();
    this.foEl = null;
    this.canvasEl = null;
    this.buffer = [];
  }

  onProcess(value: GaugeValue): void {
    if (!this.canvasEl) return;
    if (value.isStale || value.value === null) return;
    const numVal = parseFloat(String(value.value));
    if (Number.isNaN(numVal)) return;

    this.buffer.push(numVal);
    if (this.buffer.length > this.maxPoints) {
      this.buffer.shift();
    }
    this.canvasEl.dataset['pointCount'] = String(this.buffer.length);

    // SP-FX-48.12: ranges → line color override; actions → hide/show/blink on foreignObject
    const prop = this.widget.property as GraphProperty;
    const matched = matchRange(numVal, prop.ranges);
    this.lastRangeColor = matched?.color ?? null;
    applyActions(numVal, prop.actions, this.foEl, this.actionRt);

    this._draw();
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
    const prop = this.widget.property as GraphProperty;
    this.maxPoints = prop.maxPoints ?? DEFAULT_MAX_POINTS;
    this._draw();
  }

  onResize(w: number, h: number): void {
    if (!this.foEl || !this.canvasEl) return;
    this.foEl.setAttribute('width', String(w));
    this.foEl.setAttribute('height', String(h));
    this.canvasEl.width = w;
    this.canvasEl.height = h;
    this._draw();
  }

  private _draw(): void {
    const canvas = this.canvasEl;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    const prop = this.widget?.property as GraphProperty | undefined;
    const bgColor = prop?.bgColor ?? DEFAULT_BG_COLOR;
    const lineColor = this.lastRangeColor ?? prop?.lineColor ?? DEFAULT_LINE_COLOR;
    const minVal = prop?.minVal ?? DEFAULT_MIN;
    const maxVal = prop?.maxVal ?? DEFAULT_MAX;
    const range = maxVal - minVal || 1;

    const w = canvas.width;
    const h = canvas.height;

    ctx2d.fillStyle = bgColor;
    ctx2d.fillRect(0, 0, w, h);

    if (this.buffer.length < 1) return;

    const chartType: GraphChartType = prop?.chartType ?? 'line';

    if (chartType === 'bar') {
      // SP-FX-48.19: Bar chart — one vertical bar per buffer sample.
      const slot = w / this.buffer.length;
      const barW = Math.max(1, slot * 0.7);
      const gap = (slot - barW) / 2;
      ctx2d.fillStyle = lineColor;
      this.buffer.forEach((val, i) => {
        const px = i * slot + gap;
        const ratio = Math.max(0, Math.min(1, (val - minVal) / range));
        const barH = ratio * h;
        const py = h - barH;
        ctx2d.fillRect(px, py, barW, barH);
      });
      return;
    }

    // line chart (default)
    if (this.buffer.length < 2) return;

    ctx2d.beginPath();
    ctx2d.strokeStyle = lineColor;
    ctx2d.lineWidth = 1.5;

    const step = w / (this.buffer.length - 1);
    this.buffer.forEach((val, i) => {
      const px = i * step;
      const py = h - ((val - minVal) / range) * h;
      if (i === 0) {
        ctx2d.moveTo(px, py);
      } else {
        ctx2d.lineTo(px, py);
      }
    });
    ctx2d.stroke();
  }
}

export const htmlGraphMeta: GaugeMeta = {
  widgetType: 'svg-ext-html_graph',
  create: () => new HtmlGraphGauge(),
  getSignals: (w) => {
    const v = (w.property as GraphProperty).variableId;
    return v ? [v] : [];
  },
};
