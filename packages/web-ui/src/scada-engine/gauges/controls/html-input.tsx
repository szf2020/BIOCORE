// SP-FX-6: HtmlInputGauge — Enter/blur commit → ctx.onWriteIntent.
// SP-FX-48.19: FUXA fidelity — date/time/datetime-local types (commit as
// epoch ms), unit suffix for display formatting, action system (blink/hide/show).
// isSubmitting guard absorbs duplicate Enter+blur in same synchronous tick.

import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../gauge-base';
import type { FuxaWidget } from '../../models';
import {
  matchRange,
  applyActions,
  createActionRuntime,
  teardownActions,
  type Range,
  type RangeAction,
  type ActionRuntime,
} from '../runtime-helpers';

interface InputProperty {
  variableId?: string;
  inputType?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  decimals?: number;
  unit?: string;
  ranges?: Range[];
  actions?: RangeAction[];
}

const DATE_TYPES = new Set(['date', 'time', 'datetime-local']);

function toEpochMs(type: string, raw: string): number | null {
  if (!raw) return null;
  if (type === 'date') {
    const t = new Date(raw + 'T00:00:00').getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (type === 'time') {
    const m = raw.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    const hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const ss = m[3] ? parseInt(m[3], 10) : 0;
    return ((hh * 60 + mm) * 60 + ss) * 1000;
  }
  if (type === 'datetime-local') {
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function fromEpochMs(type: string, ms: number): string {
  if (!Number.isFinite(ms)) return '';
  if (type === 'date') {
    const d = new Date(ms);
    return d.toISOString().slice(0, 10);
  }
  if (type === 'time') {
    const ss = Math.floor(ms / 1000) % 60;
    const mm = Math.floor(ms / 60000) % 60;
    const hh = Math.floor(ms / 3600000) % 24;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
  }
  if (type === 'datetime-local') {
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return String(ms);
}

class HtmlInputGauge implements GaugeBase {
  private foreignObj: SVGForeignObjectElement | null = null;
  private inputEl: HTMLInputElement | null = null;
  private isSubmitting = false;
  private widget!: FuxaWidget;
  private ctx!: GaugeContext;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private blurHandler: (() => void) | null = null;
  private actionRt: ActionRuntime = createActionRuntime();

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

    const prop = widget.property as InputProperty;
    const input = document.createElement('input');
    input.type = prop.inputType ?? 'text';
    // SP-FX-FF.2: FUXA-style "#.##" default placeholder so the editor preview
    // shows the input shape and font weight before a tag is bound.
    input.placeholder = prop.placeholder ?? '#.##';
    input.style.width = '100%';
    input.style.height = '100%';
    input.style.boxSizing = 'border-box';
    // SP-FX-FF.2: fixed 20px font matches value widget visual weight.
    input.style.fontSize = '20px';
    // SP-FX-48.24: editor mode → pointer-events:none so the widget remains
    // draggable; runtime keeps full interactivity.
    if (ctx.mode !== 'runtime') input.style.pointerEvents = 'none';
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

  private _commit(raw: string): void {
    if (this.ctx.mode !== 'runtime' || this.isSubmitting) return;
    const prop = this.widget.property as InputProperty;
    const tag = prop.variableId;
    if (!tag) return;
    this.isSubmitting = true;
    const inputType = prop.inputType ?? 'text';
    const valueToSend: string | number = DATE_TYPES.has(inputType)
      ? (toEpochMs(inputType, raw) ?? raw)
      : raw;
    try {
      this.ctx.onWriteIntent?.({ tag, value: valueToSend, widgetId: this.widget.id });
    } finally {
      Promise.resolve().then(() => { this.isSubmitting = false; });
    }
  }

  onUnmount(): void {
    teardownActions(this.actionRt);
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
    const prop = this.widget.property as InputProperty;
    const inputType = prop.inputType ?? 'text';

    if (value.isStale || value.value === null || value.value === undefined) {
      this.inputEl.value = '';
    } else if (DATE_TYPES.has(inputType)) {
      const ms = Number(value.value);
      this.inputEl.value = Number.isFinite(ms) ? fromEpochMs(inputType, ms) : String(value.value);
    } else if (typeof prop.decimals === 'number' && Number.isFinite(Number(value.value))) {
      let str = Number(value.value).toFixed(prop.decimals);
      if (prop.unit) str += ' ' + prop.unit;
      this.inputEl.value = str;
    } else {
      this.inputEl.value = String(value.value);
    }

    const matched = matchRange(value.value, prop.ranges);
    if (matched?.text) {
      this.inputEl.placeholder = matched.text;
    }
    if (this.foreignObj) {
      applyActions(value.value, prop.actions, this.foreignObj as unknown as SVGElement, this.actionRt);
    }
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
    if (!this.inputEl) return;
    const prop = this.widget.property as InputProperty;
    if (prop.placeholder !== undefined) this.inputEl.placeholder = prop.placeholder;
    if (prop.min !== undefined) this.inputEl.min = String(prop.min);
    if (prop.max !== undefined) this.inputEl.max = String(prop.max);
    if (prop.inputType) this.inputEl.type = prop.inputType;
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
    const v = (w.property as InputProperty).variableId;
    return v ? [v] : [];
  },
};
