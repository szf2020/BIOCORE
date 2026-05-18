// SP-FX-10 T4: CompressorGauge — SVG compressor state indicator.
// Outer ellipse (body/shell) + inner ellipse (state indicator), multi-state color switching.
// FUXA equivalent: svg-ext-compressor

import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

interface CompressorState {
  value: string;
  color: string;
  label?: string;
}

interface CompressorProperty {
  variableId?: string;
  states?: CompressorState[];
  defaultColor?: string;
  bodyColor?: string;
}

const STALE_COLOR = '#9ca3af';
const DEFAULT_COLOR = '#9ca3af';
const DEFAULT_BODY_COLOR = '#475569';

class CompressorGauge implements GaugeBase {
  private outerEl: SVGEllipseElement | null = null;
  private innerEl: SVGEllipseElement | null = null;
  private elements: SVGElement[] = [];
  private widget!: FuxaWidget;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 60;
    const h = (widget as any).h ?? 40;
    const prop = widget.property as CompressorProperty;

    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2;
    const ry = h / 2;
    const innerRx = rx * 0.6;
    const innerRy = ry * 0.6;

    // Outer ellipse: compressor body/shell
    const outer = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    outer.setAttribute('cx', String(cx));
    outer.setAttribute('cy', String(cy));
    outer.setAttribute('rx', String(rx));
    outer.setAttribute('ry', String(ry));
    outer.setAttribute('fill', prop.bodyColor ?? DEFAULT_BODY_COLOR);
    outer.setAttribute('data-widget-id', widget.id);
    ctx.parentGroup.appendChild(outer);
    this.outerEl = outer;
    this.elements.push(outer);

    // Inner ellipse: state indicator
    const inner = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    inner.setAttribute('cx', String(cx));
    inner.setAttribute('cy', String(cy));
    inner.setAttribute('rx', String(innerRx));
    inner.setAttribute('ry', String(innerRy));
    inner.setAttribute('fill', prop.defaultColor ?? DEFAULT_COLOR);
    inner.setAttribute('data-state-indicator', 'true');
    ctx.parentGroup.appendChild(inner);
    this.innerEl = inner;
    this.elements.push(inner);
  }

  onUnmount(): void {
    this.elements.forEach(el => el.remove());
    this.elements = [];
    this.outerEl = null;
    this.innerEl = null;
  }

  onProcess(value: GaugeValue): void {
    if (!this.innerEl) return;
    const prop = this.widget.property as CompressorProperty;
    const defaultColor = prop.defaultColor ?? DEFAULT_COLOR;

    if (value.isStale || value.value === null) {
      this.innerEl.setAttribute('fill', STALE_COLOR);
      return;
    }

    const strVal = String(value.value);
    const matched = (prop.states ?? []).find(s => s.value === strVal);
    this.innerEl.setAttribute('fill', matched?.color ?? defaultColor);
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
  }

  onResize(w: number, h: number): void {
    if (!this.outerEl || !this.innerEl) return;
    const x = (this.widget as any).x ?? 0;
    const y = (this.widget as any).y ?? 0;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2;
    const ry = h / 2;
    const innerRx = rx * 0.6;
    const innerRy = ry * 0.6;

    this.outerEl.setAttribute('cx', String(cx));
    this.outerEl.setAttribute('cy', String(cy));
    this.outerEl.setAttribute('rx', String(rx));
    this.outerEl.setAttribute('ry', String(ry));

    this.innerEl.setAttribute('cx', String(cx));
    this.innerEl.setAttribute('cy', String(cy));
    this.innerEl.setAttribute('rx', String(innerRx));
    this.innerEl.setAttribute('ry', String(innerRy));
  }
}

export const compressorMeta: GaugeMeta = {
  widgetType: 'svg-ext-compressor',
  create: () => new CompressorGauge(),
  getSignals: (w) => {
    const v = (w.property as CompressorProperty).variableId;
    return v ? [v] : [];
  },
};
