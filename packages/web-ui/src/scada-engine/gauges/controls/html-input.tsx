// SP-FX-6: HtmlInputGauge — Enter/blur commit → ctx.onWriteIntent.
// isSubmitting guard absorbs duplicate Enter+blur in same synchronous tick.

import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../gauge-base';
import type { FuxaWidget } from '../../models';

class HtmlInputGauge implements GaugeBase {
  private foreignObj: SVGForeignObjectElement | null = null;
  private inputEl: HTMLInputElement | null = null;
  private isSubmitting = false;
  private widget!: FuxaWidget;
  private ctx!: GaugeContext;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private blurHandler: (() => void) | null = null;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    this.ctx = ctx;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 120;
    const h = (widget as any).h ?? 32;

    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', String(x));
    fo.setAttribute('y', String(y));
    fo.setAttribute('width', String(w));
    fo.setAttribute('height', String(h));
    fo.setAttribute('data-widget-id', widget.id);

    const prop = widget.property as { inputType?: string; placeholder?: string; min?: number; max?: number };
    const input = document.createElement('input');
    input.type = prop.inputType ?? 'text';
    input.placeholder = prop.placeholder ?? '';
    input.style.width = '100%';
    input.style.height = '100%';
    input.style.boxSizing = 'border-box';
    if (prop.min !== undefined) input.min = String(prop.min);
    if (prop.max !== undefined) input.max = String(prop.max);

    this.keydownHandler = (e: KeyboardEvent) => { if (e.key === 'Enter') this._commit(input.value); };
    this.blurHandler = () => { this._commit(input.value); };
    input.addEventListener('keydown', this.keydownHandler);
    input.addEventListener('blur', this.blurHandler);

    fo.appendChild(input);
    ctx.parentGroup.appendChild(fo);
    this.foreignObj = fo;
    this.inputEl = input;
  }

  private _commit(value: string): void {
    if (this.ctx.mode !== 'runtime' || this.isSubmitting) return;
    const tag = (this.widget.property as { variableId?: string }).variableId;
    if (!tag) return;
    this.isSubmitting = true;
    try {
      this.ctx.onWriteIntent?.({ tag, value, widgetId: this.widget.id });
    } finally {
      Promise.resolve().then(() => { this.isSubmitting = false; });
    }
  }

  onUnmount(): void {
    if (this.inputEl) {
      if (this.keydownHandler) this.inputEl.removeEventListener('keydown', this.keydownHandler);
      if (this.blurHandler) this.inputEl.removeEventListener('blur', this.blurHandler);
    }
    this.foreignObj?.remove();
    this.foreignObj = null;
    this.inputEl = null;
    this.keydownHandler = null;
    this.blurHandler = null;
  }

  onProcess(value: GaugeValue): void {
    if (!this.inputEl || document.activeElement === this.inputEl) return;
    this.inputEl.value = value.isStale ? '' : String(value.value ?? '');
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
    if (!this.inputEl) return;
    const prop = this.widget.property as { placeholder?: string; min?: number; max?: number };
    if (prop.placeholder !== undefined) this.inputEl.placeholder = prop.placeholder;
    if (prop.min !== undefined) this.inputEl.min = String(prop.min);
    if (prop.max !== undefined) this.inputEl.max = String(prop.max);
  }

  onResize(w: number, h: number): void {
    if (!this.foreignObj) return;
    this.foreignObj.setAttribute('width', String(w));
    this.foreignObj.setAttribute('height', String(h));
  }
}

export const htmlInputMeta: GaugeMeta = {
  widgetType: 'svg-ext-html_input',
  create: () => new HtmlInputGauge(),
  getSignals: (w) => {
    const v = (w.property as { variableId?: string }).variableId;
    return v ? [v] : [];
  },
};
