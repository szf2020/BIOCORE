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
  }

  onUnmount(): void {
    teardownActions(this.actionRt);
    // Restore original fills so re-mount picks up clean state.
    for (const [el, fill] of this.originalFills) {
      if (fill === null) el.removeAttribute('fill');
      else el.setAttribute('fill', fill);
    }
    this.originalFills.clear();
    this.children = [];
    this.wrap = null;
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
