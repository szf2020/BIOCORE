// SP-FX-6.2: SliderGauge — foreignObject + input[type=range] → ctx.onWriteIntent.
// FUXA equivalent: svg-ext-html_slider

import type { GaugeBase, GaugeClickContext, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

interface SliderProperty {
  variableId?: string;
  min?: number;
  max?: number;
  step?: number;
}

class SliderGauge implements GaugeBase {
  private foreignObj: SVGForeignObjectElement | null = null;
  private inputEl: HTMLInputElement | null = null;
  private widget!: FuxaWidget;
  private ctx!: GaugeContext;
  private changeHandler: (() => void) | null = null;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    this.ctx = ctx;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 200;
    const h = (widget as any).h ?? 40;
    const prop = widget.property as SliderProperty;

    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', String(x));
    fo.setAttribute('y', String(y));
    fo.setAttribute('width', String(w));
    fo.setAttribute('height', String(h));
    fo.setAttribute('data-widget-id', widget.id);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(prop.min ?? 0);
    input.max = String(prop.max ?? 100);
    input.step = String(prop.step ?? 1);
    input.style.width = '100%';
    input.disabled = ctx.mode !== 'runtime';

    this.changeHandler = () => {
      if (this.ctx.mode !== 'runtime') return;
      const p = this.widget.property as SliderProperty;
      const tag = p.variableId;
      if (!tag) return;
      this.ctx.onWriteIntent?.({ tag, value: parseFloat(input.value), widgetId: this.widget.id });
    };
    input.addEventListener('change', this.changeHandler);

    fo.appendChild(input);
    ctx.parentGroup.appendChild(fo);
    this.foreignObj = fo;
    this.inputEl = input;
  }

  onUnmount(): void {
    if (this.inputEl && this.changeHandler) {
      this.inputEl.removeEventListener('change', this.changeHandler);
    }
    this.foreignObj?.remove();
    this.foreignObj = null;
    this.inputEl = null;
    this.changeHandler = null;
  }

  onProcess(value: GaugeValue): void {
    if (!this.inputEl) return;
    if (value.isStale || value.value === null) return;
    // Only update when input is not focused to avoid overriding user drag
    if (document.activeElement === this.inputEl) return;
    this.inputEl.value = String(value.value);
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
    if (!this.inputEl) return;
    const prop = this.widget.property as SliderProperty;
    this.inputEl.min = String(prop.min ?? 0);
    this.inputEl.max = String(prop.max ?? 100);
    this.inputEl.step = String(prop.step ?? 1);
  }

  onResize(w: number, h: number): void {
    if (!this.foreignObj) return;
    this.foreignObj.setAttribute('width', String(w));
    this.foreignObj.setAttribute('height', String(h));
  }

  onClick(_e: MouseEvent, _c: GaugeClickContext): void {
    // change event handles intent; onClick is a no-op
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
