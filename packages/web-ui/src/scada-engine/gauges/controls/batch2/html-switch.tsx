// SP-FX-6.2: HtmlSwitchGauge — foreignObject + checkbox toggle → ctx.onWriteIntent.
// FUXA equivalent: svg-ext-html_switch

import type { GaugeBase, GaugeClickContext, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

interface SwitchProperty {
  variableId?: string;
  onValue?: number | string;
  offValue?: number | string;
}

class HtmlSwitchGauge implements GaugeBase {
  private foreignObj: SVGForeignObjectElement | null = null;
  private checkbox: HTMLInputElement | null = null;
  private widget!: FuxaWidget;
  private ctx!: GaugeContext;
  private changeHandler: (() => void) | null = null;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    this.ctx = ctx;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 60;
    const h = (widget as any).h ?? 30;

    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', String(x));
    fo.setAttribute('y', String(y));
    fo.setAttribute('width', String(w));
    fo.setAttribute('height', String(h));
    fo.setAttribute('data-widget-id', widget.id);

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.style.width = '100%';
    input.style.height = '100%';
    input.disabled = ctx.mode !== 'runtime';

    this.changeHandler = () => {
      if (this.ctx.mode !== 'runtime') return;
      const prop = this.widget.property as SwitchProperty;
      const tag = prop.variableId;
      if (!tag) return;
      const val = input.checked ? (prop.onValue ?? 1) : (prop.offValue ?? 0);
      this.ctx.onWriteIntent?.({ tag, value: val, widgetId: this.widget.id });
    };
    input.addEventListener('change', this.changeHandler);

    fo.appendChild(input);
    ctx.parentGroup.appendChild(fo);
    this.foreignObj = fo;
    this.checkbox = input;
  }

  onUnmount(): void {
    if (this.checkbox && this.changeHandler) {
      this.checkbox.removeEventListener('change', this.changeHandler);
    }
    this.foreignObj?.remove();
    this.foreignObj = null;
    this.checkbox = null;
    this.changeHandler = null;
  }

  onProcess(value: GaugeValue): void {
    if (!this.checkbox) return;
    if (value.isStale || value.value === null) {
      this.checkbox.checked = false;
      return;
    }
    const prop = this.widget.property as SwitchProperty;
    const onVal = String(prop.onValue ?? '1');
    this.checkbox.checked = String(value.value) === onVal;
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
  }

  onResize(w: number, h: number): void {
    if (!this.foreignObj) return;
    this.foreignObj.setAttribute('width', String(w));
    this.foreignObj.setAttribute('height', String(h));
  }

  onClick(_e: MouseEvent, _c: GaugeClickContext): void {
    // change event handles the write intent; onClick is a no-op
  }
}

export const htmlSwitchMeta: GaugeMeta = {
  widgetType: 'svg-ext-html_switch',
  create: () => new HtmlSwitchGauge(),
  getSignals: (w) => {
    const v = (w.property as SwitchProperty).variableId;
    return v ? [v] : [];
  },
};
