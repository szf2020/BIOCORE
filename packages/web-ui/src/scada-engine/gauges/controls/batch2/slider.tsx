// SP-FX-6.2: SliderGauge — vertical FUXA-style slider.
// SP-FX-FF.17: rewrote from a bare native <input type=range> to a SVG render
// (vertical track + dark filled portion + rectangular handle + 0/50/100 scale).
// A hidden <input type=range> is kept inside a foreignObject so existing
// tests + ARIA semantics + the change-event → onWriteIntent flow continue to
// work. Pointer drag on the SVG handle (runtime mode only) writes through
// the hidden input and dispatches a 'change' event.

import type { GaugeBase, GaugeClickContext, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

interface SliderProperty {
  variableId?: string;
  min?: number;
  max?: number;
  step?: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const PAD_Y = 12;
const HANDLE_W = 28;
const HANDLE_H = 18;
const TRACK_W = 6;
const FILL_COLOR = '#1e293b';
const TRACK_BG_COLOR = '#e2e8f0';
const GRIP_COLOR = '#cbd5e1';
const TICK_COLOR = '#475569';

class SliderGauge implements GaugeBase {
  private rootG: SVGGElement | null = null;
  private foreignObj: SVGForeignObjectElement | null = null;
  private inputEl: HTMLInputElement | null = null;
  private trackBg: SVGRectElement | null = null;
  private trackFill: SVGRectElement | null = null;
  private handleG: SVGGElement | null = null;
  private widget!: FuxaWidget;
  private ctx!: GaugeContext;
  private changeHandler: (() => void) | null = null;
  private pointerDownHandler: ((e: PointerEvent) => void) | null = null;
  private pointerMoveHandler: ((e: PointerEvent) => void) | null = null;
  private pointerUpHandler: ((e: PointerEvent) => void) | null = null;
  private dragging = false;

  private layoutForValue(value: number): void {
    if (!this.rootG || !this.trackFill || !this.handleG) return;
    const w = (this.widget as any).w ?? 100;
    const h = (this.widget as any).h ?? 180;
    const x = (this.widget as any).x ?? 0;
    const y = (this.widget as any).y ?? 0;
    const prop = this.widget.property as SliderProperty;
    const min = prop.min ?? 0;
    const max = prop.max ?? 100;
    const trackX = x + w * 0.35;
    const trackTop = y + PAD_Y;
    const trackBottom = y + h - PAD_Y;
    const trackH = trackBottom - trackTop;
    const ratio = max === min ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)));
    const handleY = trackTop + ratio * trackH;
    this.trackFill.setAttribute('height', String(Math.max(0, handleY - trackTop)));
    this.handleG.setAttribute('transform', `translate(${trackX - HANDLE_W / 2} ${handleY - HANDLE_H / 2})`);
    void w;
  }

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    this.ctx = ctx;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 100;
    const h = (widget as any).h ?? 180;
    const prop = widget.property as SliderProperty;
    const min = prop.min ?? 0;
    const max = prop.max ?? 100;
    const step = prop.step ?? 1;

    const root = document.createElementNS(SVG_NS, 'g');

    // Hidden input + foreignObject — keeps tests + accessibility behavior.
    const fo = document.createElementNS(SVG_NS, 'foreignObject');
    fo.setAttribute('x', String(x));
    fo.setAttribute('y', String(y));
    fo.setAttribute('width', '1');
    fo.setAttribute('height', '1');
    fo.setAttribute('data-widget-id', widget.id);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(min);
    input.disabled = ctx.mode !== 'runtime';
    input.style.display = 'none';
    this.changeHandler = () => {
      const v = parseFloat(input.value);
      this.layoutForValue(v);
      if (this.ctx.mode !== 'runtime') return;
      const p = this.widget.property as SliderProperty;
      const tag = p.variableId;
      if (!tag) return;
      this.ctx.onWriteIntent?.({ tag, value: v, widgetId: this.widget.id });
    };
    input.addEventListener('change', this.changeHandler);
    fo.appendChild(input);
    root.appendChild(fo);

    // Geometry
    const trackX = x + w * 0.35;
    const trackTop = y + PAD_Y;
    const trackBottom = y + h - PAD_Y;
    const trackH = trackBottom - trackTop;

    // Track BG (full vertical pill)
    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('x', String(trackX - TRACK_W / 2));
    bg.setAttribute('y', String(trackTop));
    bg.setAttribute('width', String(TRACK_W));
    bg.setAttribute('height', String(trackH));
    bg.setAttribute('rx', String(TRACK_W / 2));
    bg.setAttribute('fill', TRACK_BG_COLOR);
    bg.setAttribute('data-slider-track-bg', '');
    root.appendChild(bg);

    // Filled portion (top → handle position). Height set by layoutForValue.
    const fill = document.createElementNS(SVG_NS, 'rect');
    fill.setAttribute('x', String(trackX - TRACK_W / 2));
    fill.setAttribute('y', String(trackTop));
    fill.setAttribute('width', String(TRACK_W));
    fill.setAttribute('height', '0');
    fill.setAttribute('rx', String(TRACK_W / 2));
    fill.setAttribute('fill', FILL_COLOR);
    fill.setAttribute('data-slider-track-fill', '');
    root.appendChild(fill);

    // Scale ticks + labels (min top, mid, max bottom)
    const tickValues = [min, (min + max) / 2, max];
    const tickRatios = [0, 0.5, 1];
    const labelX = trackX + 20;
    for (let i = 0; i < 3; i++) {
      const ty = trackTop + tickRatios[i] * trackH;
      const tick = document.createElementNS(SVG_NS, 'line');
      tick.setAttribute('x1', String(trackX + TRACK_W));
      tick.setAttribute('x2', String(trackX + TRACK_W + 6));
      tick.setAttribute('y1', String(ty));
      tick.setAttribute('y2', String(ty));
      tick.setAttribute('stroke', TICK_COLOR);
      tick.setAttribute('stroke-width', '1');
      root.appendChild(tick);
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', String(labelX));
      text.setAttribute('y', String(ty));
      text.setAttribute('font-size', '12');
      text.setAttribute('font-family', 'ui-monospace, monospace');
      text.setAttribute('fill', TICK_COLOR);
      text.setAttribute('dominant-baseline', 'central');
      text.textContent = String(Math.round(tickValues[i]));
      root.appendChild(text);
    }

    // Handle (rectangular with 2 grip lines)
    const handleG = document.createElementNS(SVG_NS, 'g');
    handleG.setAttribute('data-slider-handle', '');
    if (ctx.mode === 'runtime') (handleG as unknown as HTMLElement).style.cursor = 'pointer';
    const handleRect = document.createElementNS(SVG_NS, 'rect');
    handleRect.setAttribute('x', '0');
    handleRect.setAttribute('y', '0');
    handleRect.setAttribute('width', String(HANDLE_W));
    handleRect.setAttribute('height', String(HANDLE_H));
    handleRect.setAttribute('rx', '3');
    handleRect.setAttribute('fill', FILL_COLOR);
    handleG.appendChild(handleRect);
    for (let i = 0; i < 2; i++) {
      const ln = document.createElementNS(SVG_NS, 'line');
      const yy = HANDLE_H * 0.38 + i * HANDLE_H * 0.24;
      ln.setAttribute('x1', String(HANDLE_W * 0.25));
      ln.setAttribute('x2', String(HANDLE_W * 0.75));
      ln.setAttribute('y1', String(yy));
      ln.setAttribute('y2', String(yy));
      ln.setAttribute('stroke', GRIP_COLOR);
      ln.setAttribute('stroke-width', '1.5');
      handleG.appendChild(ln);
    }
    root.appendChild(handleG);

    // SP-FX-FF.8: ColorPaletteBar tint.
    const accent = (prop as { color?: string }).color;
    if (accent) {
      fill.setAttribute('fill', accent);
      handleRect.setAttribute('fill', accent);
      input.style.accentColor = accent;
    }

    ctx.parentGroup.appendChild(root);
    this.rootG = root;
    this.foreignObj = fo;
    this.inputEl = input;
    this.trackBg = bg;
    this.trackFill = fill;
    this.handleG = handleG;

    // Initial layout
    this.layoutForValue(min);
    void trackBottom;
    void trackH;

    // Pointer drag (runtime only)
    if (ctx.mode === 'runtime') {
      this.pointerDownHandler = (e: PointerEvent) => {
        this.dragging = true;
        try { (handleG as unknown as { setPointerCapture?: (id: number) => void }).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
        e.stopPropagation();
      };
      this.pointerMoveHandler = (e: PointerEvent) => {
        if (!this.dragging || !this.inputEl) return;
        const svg = ctx.parentGroup.ownerSVGElement;
        if (!svg) return;
        const ctm = (svg as SVGSVGElement).getScreenCTM?.();
        const create = (svg as SVGSVGElement).createSVGPoint?.bind(svg);
        if (!ctm || !create) return;
        const pt = create();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const local = pt.matrixTransform(ctm.inverse());
        const pp = this.widget.property as SliderProperty;
        const lmin = pp.min ?? 0;
        const lmax = pp.max ?? 100;
        const lstep = pp.step ?? 1;
        const wy = (this.widget as any).y ?? 0;
        const wh = (this.widget as any).h ?? 180;
        const ttop = wy + PAD_Y;
        const tbot = wy + wh - PAD_Y;
        const ratio = Math.max(0, Math.min(1, (local.y - ttop) / (tbot - ttop)));
        let v = lmin + ratio * (lmax - lmin);
        if (lstep > 0) v = Math.round(v / lstep) * lstep;
        v = Math.max(lmin, Math.min(lmax, v));
        this.inputEl.value = String(v);
        this.layoutForValue(v);
      };
      this.pointerUpHandler = (e: PointerEvent) => {
        if (!this.dragging) return;
        this.dragging = false;
        try { (handleG as unknown as { releasePointerCapture?: (id: number) => void }).releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
        if (this.inputEl) this.inputEl.dispatchEvent(new Event('change'));
      };
      handleG.addEventListener('pointerdown', this.pointerDownHandler);
      window.addEventListener('pointermove', this.pointerMoveHandler);
      window.addEventListener('pointerup', this.pointerUpHandler);
    }
  }

  onUnmount(): void {
    if (this.inputEl && this.changeHandler) {
      this.inputEl.removeEventListener('change', this.changeHandler);
    }
    if (this.handleG && this.pointerDownHandler) {
      this.handleG.removeEventListener('pointerdown', this.pointerDownHandler);
    }
    if (this.pointerMoveHandler) window.removeEventListener('pointermove', this.pointerMoveHandler);
    if (this.pointerUpHandler) window.removeEventListener('pointerup', this.pointerUpHandler);
    this.rootG?.remove();
    this.rootG = null;
    this.foreignObj = null;
    this.inputEl = null;
    this.trackBg = null;
    this.trackFill = null;
    this.handleG = null;
    this.changeHandler = null;
    this.pointerDownHandler = null;
    this.pointerMoveHandler = null;
    this.pointerUpHandler = null;
    this.dragging = false;
  }

  onProcess(value: GaugeValue): void {
    if (!this.inputEl) return;
    if (value.isStale || value.value === null) return;
    if (this.dragging) return;
    const v = Number(value.value);
    if (!Number.isFinite(v)) return;
    this.inputEl.value = String(v);
    this.layoutForValue(v);
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
    if (!this.inputEl) return;
    const prop = this.widget.property as SliderProperty;
    this.inputEl.min = String(prop.min ?? 0);
    this.inputEl.max = String(prop.max ?? 100);
    this.inputEl.step = String(prop.step ?? 1);
    this.layoutForValue(parseFloat(this.inputEl.value));
  }

  onResize(w: number, h: number): void {
    if (!this.rootG) return;
    (this.widget as any).w = w;
    (this.widget as any).h = h;
    if (this.inputEl) this.layoutForValue(parseFloat(this.inputEl.value));
  }

  onClick(_e: MouseEvent, _c: GaugeClickContext): void {
    // pointer drag drives writes; onClick is a no-op
  }
}

export const sliderMeta: GaugeMeta = {
  widgetType: 'svg-ext-html_slider',
  create: () => new SliderGauge(),
  getSignals: (w) => {
    const v = (w.property as SliderProperty).variableId;
    return v ? [v] : [];
  },
};
