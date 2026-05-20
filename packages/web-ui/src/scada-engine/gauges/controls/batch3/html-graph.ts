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
  // SP-FX-FF.39: FUXA chart parity — title + tick labels.
  title?: string;
  showGrid?: boolean;
}

const DEFAULT_MAX_POINTS = 60;
const DEFAULT_LINE_COLOR = '#3b82f6';
// SP-FX-FF.39: FUXA parity — chart background defaults to white so axes/title
// are legible without designer setting bgColor manually.
const DEFAULT_BG_COLOR = '#ffffff';
const DEFAULT_MIN = 0;
const DEFAULT_MAX = 100;
// SP-FX-FF.39: chart frame styling
const AXIS_COLOR = '#9ca3af';
const GRID_COLOR = '#e5e7eb';
const TITLE_COLOR = '#1f2937';
const LABEL_COLOR = '#6b7280';
const PADDING_LEFT = 32;
const PADDING_RIGHT = 8;
const PADDING_TOP = 22;
const PADDING_BOTTOM = 20;

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
    // SP-FX-FF.8: CSS-level background so ColorPaletteBar (prop.bgColor) is visible
    // even before any data points are buffered (canvas pixels aren't reachable
    // via attribute reads — the CSS background is).
    canvas.style.backgroundColor = prop.bgColor ?? DEFAULT_BG_COLOR;
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
    const title = prop?.title ?? '';
    const showGrid = prop?.showGrid !== false;

    const w = canvas.width;
    const h = canvas.height;

    ctx2d.fillStyle = bgColor;
    ctx2d.fillRect(0, 0, w, h);

    // SP-FX-FF.39: chart plot area inside padding so axes/title/labels fit.
    const plotL = PADDING_LEFT;
    const plotT = PADDING_TOP;
    const plotR = w - PADDING_RIGHT;
    const plotB = h - PADDING_BOTTOM;
    const plotW = Math.max(1, plotR - plotL);
    const plotH = Math.max(1, plotB - plotT);

    // Title (top-center)
    if (title && plotW > 40) {
      ctx2d.fillStyle = TITLE_COLOR;
      ctx2d.font = 'bold 12px sans-serif';
      ctx2d.textAlign = 'center';
      ctx2d.textBaseline = 'top';
      ctx2d.fillText(title, w / 2, 4);
    }

    // Grid lines (4 horizontal bands inside plot area) + tick labels (Y min/max)
    if (showGrid) {
      ctx2d.strokeStyle = GRID_COLOR;
      ctx2d.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const gy = plotT + (plotH * i) / 4;
        ctx2d.beginPath();
        ctx2d.moveTo(plotL, gy);
        ctx2d.lineTo(plotR, gy);
        ctx2d.stroke();
      }
    }

    // Y axis line
    ctx2d.strokeStyle = AXIS_COLOR;
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    ctx2d.moveTo(plotL, plotT);
    ctx2d.lineTo(plotL, plotB);
    ctx2d.lineTo(plotR, plotB);
    ctx2d.stroke();

    // Y axis tick labels (max top, min bottom)
    ctx2d.fillStyle = LABEL_COLOR;
    ctx2d.font = '10px sans-serif';
    ctx2d.textAlign = 'right';
    ctx2d.textBaseline = 'middle';
    ctx2d.fillText(String(maxVal), plotL - 4, plotT);
    ctx2d.fillText(String(minVal), plotL - 4, plotB);

    if (this.buffer.length < 1) return;

    const chartType: GraphChartType = prop?.chartType ?? 'line';

    if (chartType === 'bar') {
      // SP-FX-48.19: Bar chart — one vertical bar per buffer sample.
      const slot = plotW / this.buffer.length;
      const barW = Math.max(1, slot * 0.7);
      const gap = (slot - barW) / 2;
      ctx2d.fillStyle = lineColor;
      this.buffer.forEach((val, i) => {
        const px = plotL + i * slot + gap;
        const ratio = Math.max(0, Math.min(1, (val - minVal) / range));
        const barH = ratio * plotH;
        const py = plotB - barH;
        ctx2d.fillRect(px, py, barW, barH);
      });
      return;
    }

    // line chart (default)
    if (this.buffer.length < 2) return;

    ctx2d.beginPath();
    ctx2d.strokeStyle = lineColor;
    ctx2d.lineWidth = 1.5;

    const step = plotW / (this.buffer.length - 1);
    this.buffer.forEach((val, i) => {
      const px = plotL + i * step;
      const py = plotB - ((val - minVal) / range) * plotH;
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
