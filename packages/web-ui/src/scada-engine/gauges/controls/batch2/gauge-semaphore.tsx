// SP-FX-6.2: GaugeSemaphore — colors a circle fill per value ranges.
// FUXA equivalent: svg-ext-gauge_semaphore

import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

interface SemaphoreProperty {
  variableId?: string;
  ranges?: Array<{ min: number; max: number; color: string }>;
  bitmask?: number;
}

const STALE_COLOR = '#9ca3af';

class GaugeSemaphore implements GaugeBase {
  private circleEl: SVGCircleElement | null = null;
  private widget!: FuxaWidget;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 40;
    const h = (widget as any).h ?? 40;

    const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    const r = Math.min(w, h) / 2;
    el.setAttribute('cx', String(x + w / 2));
    el.setAttribute('cy', String(y + h / 2));
    el.setAttribute('r', String(r));
    el.setAttribute('fill', STALE_COLOR);
    el.setAttribute('data-widget-id', widget.id);
    ctx.parentGroup.appendChild(el);
    this.circleEl = el;
  }

  onUnmount(): void {
    this.circleEl?.remove();
    this.circleEl = null;
  }

  onProcess(value: GaugeValue): void {
    if (!this.circleEl) return;
    if (value.isStale || value.value === null) {
      this.circleEl.setAttribute('fill', STALE_COLOR);
      return;
    }
    const prop = this.widget.property as SemaphoreProperty;
    let numVal = typeof value.value === 'boolean'
      ? Number(value.value)
      : parseFloat(String(value.value));
    if (Number.isNaN(numVal)) numVal = 0;
    if (prop.bitmask !== undefined && prop.bitmask > 0) {
      numVal = numVal & prop.bitmask;
    }
    const matched = (prop.ranges ?? []).find(r => r.min <= numVal && r.max >= numVal);
    this.circleEl.setAttribute('fill', matched?.color ?? STALE_COLOR);
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

export const gaugeSemaphoreMeta: GaugeMeta = {
  widgetType: 'svg-ext-gauge_semaphore',
  create: () => new GaugeSemaphore(),
  getSignals: (w) => {
    const v = (w.property as SemaphoreProperty).variableId;
    return v ? [v] : [];
  },
};
