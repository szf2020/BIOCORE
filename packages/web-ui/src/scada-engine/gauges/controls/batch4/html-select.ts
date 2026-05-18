// SP-FX-10 T10: HtmlSelectGauge — foreignObject + HTML select, onChange WriteIntent.
// FUXA equivalent: svg-ext-html_select

import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProperty {
  variableId?: string;
  options?: SelectOption[];
  placeholder?: string;
}

class HtmlSelectGauge implements GaugeBase {
  private foreignObj: SVGForeignObjectElement | null = null;
  private selectEl: HTMLSelectElement | null = null;
  private widget!: FuxaWidget;
  private ctx!: GaugeContext;
  private changeHandler: (() => void) | null = null;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    this.ctx = ctx;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 120;
    const h = (widget as any).h ?? 30;
    const prop = widget.property as SelectProperty;

    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', String(x));
    fo.setAttribute('y', String(y));
    fo.setAttribute('width', String(w));
    fo.setAttribute('height', String(h));
    fo.setAttribute('data-widget-id', widget.id);

    const select = document.createElement('select');
    select.style.width = '100%';
    select.style.height = '100%';
    select.disabled = ctx.mode !== 'runtime';

    // Placeholder option
    const placeholder = prop.placeholder ?? '请选择...';
    const placeholderOpt = document.createElement('option');
    placeholderOpt.value = '';
    placeholderOpt.textContent = placeholder;
    placeholderOpt.disabled = true;
    select.appendChild(placeholderOpt);

    // Value options
    for (const opt of (prop.options ?? [])) {
      const optEl = document.createElement('option');
      optEl.value = opt.value;
      optEl.textContent = opt.label;
      select.appendChild(optEl);
    }

    this.changeHandler = () => {
      if (this.ctx.mode !== 'runtime') return;
      const p = this.widget.property as SelectProperty;
      if (!p.variableId) return;
      this.ctx.onWriteIntent?.({ tag: p.variableId, value: select.value, widgetId: this.widget.id });
    };
    select.addEventListener('change', this.changeHandler);

    fo.appendChild(select);
    ctx.parentGroup.appendChild(fo);
    this.foreignObj = fo;
    this.selectEl = select;
  }

  onUnmount(): void {
    if (this.selectEl && this.changeHandler) {
      this.selectEl.removeEventListener('change', this.changeHandler);
    }
    this.foreignObj?.remove();
    this.foreignObj = null;
    this.selectEl = null;
    this.changeHandler = null;
  }

  onProcess(value: GaugeValue): void {
    if (!this.selectEl) return;
    if (value.isStale || value.value === null) {
      this.selectEl.value = '';
      return;
    }
    this.selectEl.value = String(value.value);
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
  }

  onResize(w: number, h: number): void {
    if (!this.foreignObj) return;
    this.foreignObj.setAttribute('width', String(w));
    this.foreignObj.setAttribute('height', String(h));
  }
}

export const htmlSelectMeta: GaugeMeta = {
  widgetType: 'svg-ext-html_select',
  create: () => new HtmlSelectGauge(),
  getSignals: (w) => {
    const v = (w.property as SelectProperty).variableId;
    return v ? [v] : [];
  },
};
