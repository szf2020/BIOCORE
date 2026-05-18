// SP-FX-9 T2: HtmlBagGauge — LED indicator using foreignObject + colored div.
// FUXA equivalent: svg-ext-html_bag

import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

interface BagProperty {
  variableId?: string;
  onColor?: string;
  offColor?: string;
  onValue?: string;
  shape?: 'circle' | 'rect';
}

const STALE_COLOR = '#9ca3af';
const DEFAULT_ON_COLOR = '#22c55e';
const DEFAULT_OFF_COLOR = '#6b7280';

class HtmlBagGauge implements GaugeBase {
  private foEl: SVGForeignObjectElement | null = null;
  private divEl: HTMLDivElement | null = null;
  private widget!: FuxaWidget;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 40;
    const h = (widget as any).h ?? 40;
    const prop = widget.property as BagProperty;

    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', String(x));
    fo.setAttribute('y', String(y));
    fo.setAttribute('width', String(w));
    fo.setAttribute('height', String(h));
    fo.setAttribute('data-widget-id', widget.id);

    const div = document.createElement('div');
    const offColor = prop.offColor ?? DEFAULT_OFF_COLOR;
    div.style.width = '100%';
    div.style.height = '100%';
    div.style.backgroundColor = offColor;
    div.style.borderRadius = prop.shape === 'rect' ? '4px' : '50%';
    div.dataset['color'] = offColor;
    fo.appendChild(div);
    ctx.parentGroup.appendChild(fo);

    this.foEl = fo;
    this.divEl = div;
  }

  onUnmount(): void {
    this.foEl?.remove();
    this.foEl = null;
    this.divEl = null;
  }

  onProcess(value: GaugeValue): void {
    if (!this.divEl) return;
    const prop = this.widget.property as BagProperty;
    if (value.isStale || value.value === null) {
      this.divEl.style.backgroundColor = STALE_COLOR;
      this.divEl.dataset['color'] = STALE_COLOR;
      return;
    }
    const onValue = prop.onValue ?? '1';
    const isOn = String(value.value) === onValue;
    const color = isOn
      ? (prop.onColor ?? DEFAULT_ON_COLOR)
      : (prop.offColor ?? DEFAULT_OFF_COLOR);
    this.divEl.style.backgroundColor = color;
    this.divEl.dataset['color'] = color;
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
  }

  onResize(w: number, h: number): void {
    if (!this.foEl) return;
    this.foEl.setAttribute('width', String(w));
    this.foEl.setAttribute('height', String(h));
  }
}

export const htmlBagMeta: GaugeMeta = {
  widgetType: 'svg-ext-html_bag',
  create: () => new HtmlBagGauge(),
  getSignals: (w) => {
    const v = (w.property as BagProperty).variableId;
    return v ? [v] : [];
  },
};
