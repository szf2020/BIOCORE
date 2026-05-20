// SP-FX-FF.38: ShapeGauge — runtime hookup for FUXA shape widgets.
//
// widget.type = 'shape'. DOM is created by canvas-svg.ts case 'shape' during
// CanvasController.loadView() (editor AND runtime share that code path), so
// ShapeGauge does NOT create elements in onMount — it attaches to the existing
// wrapper via [data-widget-id] lookup. This avoids double-rendering when
// RuntimeCanvas iterates widgets and creates gauges.
//
// On each process tick:
//   - matchRange(prop.ranges, value) → fill all child primitives with the
//     matching range color (gives value-driven color animation).
//   - applyActions(prop.actions, value) on the wrapper element → hide/show/
//     blink (FUXA-style discrete animation effects).

import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../gauge-base';
import type { FuxaWidget } from '../../models';
import {
  matchRange, applyActions,
  createActionRuntime, teardownActions,
  type Range, type RangeAction, type ActionRuntime,
} from '../runtime-helpers';

interface ShapeProperty {
  shapeName?: string;
  fill?: string;
  variableId?: string;
  ranges?: Range[];
  actions?: RangeAction[];
  // SP-FX-FF.40: 旋转动画 — 度/秒。0 或 undefined 关闭。正负决定方向。
  // 用于 eli/piston 等"动画 shape" widget。
  rotateSpeed?: number;
}

// SVG primitive tags created by canvas-svg shape upsertWidget from
// shape-catalog `content[]`. Limiting to these prevents touching unrelated
// children if the shape adds non-fillable nodes in the future.
const FILLABLE_SELECTOR = 'ellipse, path, rect, circle, polygon, polyline, line';

class ShapeGauge implements GaugeBase {
  private wrap: SVGElement | null = null;
  private children: SVGElement[] = [];
  private originalFills = new Map<SVGElement, string | null>();
  private widget!: FuxaWidget;
  private actionRt: ActionRuntime = createActionRuntime();
  // SP-FX-FF.40: rotate animation state
  private rafId: number | null = null;
  private angle = 0;
  private lastTs = 0;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    const wrap = ctx.parentGroup.querySelector(
      `[data-widget-id="${widget.id}"]`,
    ) as SVGElement | null;
    if (!wrap) return;
    this.wrap = wrap;
    this.children = Array.from(wrap.querySelectorAll(FILLABLE_SELECTOR)) as SVGElement[];
    for (const c of this.children) {
      this.originalFills.set(c, c.getAttribute('fill'));
    }
    this.startRotateIfNeeded();
  }

  onUnmount(): void {
    teardownActions(this.actionRt);
    this.stopRotate();
    // Restore original fills so re-mount picks up clean state.
    for (const [el, fill] of this.originalFills) {
      if (fill === null) el.removeAttribute('fill');
      else el.setAttribute('fill', fill);
    }
    this.originalFills.clear();
    this.children = [];
    this.wrap = null;
  }

  // SP-FX-FF.40: rotate animation — rAF loop, transform-box=fill-box so the
  // shape rotates around its own center (SVG default origin is (0,0) on the
  // outer element which would orbit the widget around the canvas origin).
  private startRotateIfNeeded(): void {
    if (this.rafId !== null) return;
    const speed = Number((this.widget.property as ShapeProperty).rotateSpeed ?? 0);
    if (!Number.isFinite(speed) || speed === 0) return;
    if (!this.wrap) return;
    // CSS transform-box + transform-origin so rotation centers on the
    // widget's own bbox rather than the canvas origin.
    (this.wrap as unknown as SVGElement).style.transformBox = 'fill-box';
    (this.wrap as unknown as SVGElement).style.transformOrigin = 'center';
    this.lastTs = 0;
    const tick = (ts: number): void => {
      if (!this.wrap) { this.rafId = null; return; }
      if (this.lastTs === 0) this.lastTs = ts;
      const dt = (ts - this.lastTs) / 1000;
      this.lastTs = ts;
      const cur = Number((this.widget.property as ShapeProperty).rotateSpeed ?? 0);
      this.angle = (this.angle + cur * dt) % 360;
      this.wrap.style.transform = `rotate(${this.angle}deg)`;
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopRotate(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.angle = 0;
    this.lastTs = 0;
  }

  onProcess(value: GaugeValue): void {
    if (!this.wrap) return;
    const prop = this.widget.property as ShapeProperty;
    const numVal = Number(value.value);

    // ranges → fill override (no match → restore original)
    const rangeMatched = matchRange(numVal, prop.ranges);
    if (rangeMatched?.color) {
      for (const c of this.children) c.setAttribute('fill', rangeMatched.color);
    } else {
      for (const c of this.children) {
        const orig = this.originalFills.get(c) ?? null;
        if (orig === null) c.removeAttribute('fill');
        else c.setAttribute('fill', orig);
      }
    }

    // actions → hide/show/blink on wrapper
    applyActions(numVal, prop.actions, this.wrap, this.actionRt);
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
    // SP-FX-FF.40: re-evaluate rotation on property edit (designer changes
    // rotateSpeed in PropertyPanel → animation starts/stops live).
    const speed = Number((this.widget.property as ShapeProperty).rotateSpeed ?? 0);
    if (speed === 0 && this.rafId !== null) this.stopRotate();
    else if (speed !== 0 && this.rafId === null) this.startRotateIfNeeded();
  }

  onResize(): void {
    // No-op — canvas-svg handles geometry; ranges/actions are value-driven only.
  }
}

export const shapeMeta: GaugeMeta = {
  widgetType: 'shape',
  create: () => new ShapeGauge(),
  getSignals: (w) => {
    const v = (w.property as ShapeProperty).variableId;
    return v ? [v] : [];
  },
};
