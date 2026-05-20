// SP-FX-10 T10: HtmlSelectGauge — foreignObject + HTML select, onChange WriteIntent.
// SP-FX-48.19 (phase 2): FUXA fidelity — ranges[]→options[] derivation,
// range per-option bg/fg/stroke, readonly toggle, action system.
// FUXA equivalent: svg-ext-html_select

import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';
import {
  applyActions,
  createActionRuntime,
  teardownActions,
  type Range,
  type RangeAction,
  type ActionRuntime,
} from '../../runtime-helpers';

interface SelectOption {
  value: string;
  label: string;
  bgColor?: string;
  textColor?: string;
}

interface SelectProperty {
  variableId?: string;
  options?: SelectOption[];
  placeholder?: string;
  readonly?: boolean;
  ranges?: Range[];
  actions?: RangeAction[];
}

// SP-FX-48.19: when `options[]` absent and `ranges[]` present, derive option
// list from ranges using FUXA convention: range.min → option value, range.text
// → option label, range.color → option bg, range.textColor → option fg.
function deriveOptions(prop: SelectProperty): SelectOption[] {
  if (Array.isArray(prop.options) && prop.options.length > 0) return prop.options;
  if (!Array.isArray(prop.ranges)) return [];
  return prop.ranges
    .filter((r) => Number.isFinite(r.min))
    .map((r) => ({
      value: String(r.min),
      label: r.text ?? String(r.min),
      bgColor: r.color,
      textColor: r.textColor,
    }));
}

class HtmlSelectGauge implements GaugeBase {
  private foreignObj: SVGForeignObjectElement | null = null;
  private selectEl: HTMLSelectElement | null = null;
  private widget!: FuxaWidget;
  private ctx!: GaugeContext;
  private changeHandler: (() => void) | null = null;
  private actionRt: ActionRuntime = createActionRuntime();

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
    select.disabled = ctx.mode !== 'runtime' || prop.readonly === true;
    // SP-FX-48.24: editor mode → pointer-events:none so the widget can be dragged
    if (ctx.mode !== 'runtime') select.style.pointerEvents = 'none';
    // SP-FX-FF.14: FUXA visual parity — blue bg + dark text + 20px font + 2px
    // corner radius. Designers can still override via prop.color / bgColor.
    select.style.backgroundColor = (prop as { bgColor?: string }).bgColor ?? '#3b82f6';
    select.style.color = (prop as { color?: string }).color ?? '#0f172a';
    select.style.fontSize = '20px';
    select.style.borderRadius = '2px';
    select.style.padding = '0 6px';
    if (prop.readonly === true) {
      select.style.border = '0';
      select.style.appearance = 'none';
      select.style.background = 'transparent';
    }
    // SP-FX-FF.8: ColorPaletteBar tints the select text + border.
    const selectColor = (prop as { color?: string }).color;
    if (selectColor) {
      select.style.color = selectColor;
      select.style.borderColor = selectColor;
    }

    const placeholderText = prop.placeholder ?? '请选择...';
    const placeholderOpt = document.createElement('option');
    placeholderOpt.value = '';
    placeholderOpt.textContent = placeholderText;
    placeholderOpt.disabled = true;
    // SP-FX-FF.14: mark selected so the placeholder text actually shows in the
    // collapsed select (previously the option existed but wasn't the chosen
    // entry, so the select appeared blank).
    placeholderOpt.selected = true;
    select.appendChild(placeholderOpt);

    for (const opt of deriveOptions(prop)) {
      const optEl = document.createElement('option');
      optEl.value = opt.value;
      optEl.textContent = opt.label;
      if (opt.bgColor) optEl.style.backgroundColor = opt.bgColor;
      if (opt.textColor) optEl.style.color = opt.textColor;
      select.appendChild(optEl);
    }

    this.changeHandler = () => {
      if (this.ctx.mode !== 'runtime') return;
      const p = this.widget.property as SelectProperty;
      if (!p.variableId || p.readonly === true) return;
      this.ctx.onWriteIntent?.({ tag: p.variableId, value: select.value, widgetId: this.widget.id });
    };
    select.addEventListener('change', this.changeHandler);

    fo.appendChild(select);
    ctx.parentGroup.appendChild(fo);
    this.foreignObj = fo;
    this.selectEl = select;
  }

  onUnmount(): void {
    teardownActions(this.actionRt);
    if (this.selectEl && this.changeHandler) {
      this.selectEl.removeEventListener('change', this.changeHandler);
    }
    this.foreignObj?.remove();
    this.foreignObj = null;
    this.selectEl = null;
    this.changeHandler = null;
  }

  onProcess(value: GaugeValue): void {
    if (!this.selectEl || !this.foreignObj) return;
    const prop = this.widget.property as SelectProperty;
    if (value.isStale || value.value === null) {
      this.selectEl.value = '';
    } else {
      this.selectEl.value = String(value.value);
    }
    applyActions(value.value, prop.actions, this.foreignObj as unknown as SVGElement, this.actionRt);
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
    if (!this.selectEl) return;
    const prop = this.widget.property as SelectProperty;
    const prevValue = this.selectEl.value;
    Array.from(this.selectEl.children).forEach((child, i) => {
      if (i > 0) child.remove();
    });
    for (const opt of deriveOptions(prop)) {
      const optEl = document.createElement('option');
      optEl.value = opt.value;
      optEl.textContent = opt.label;
      if (opt.bgColor) optEl.style.backgroundColor = opt.bgColor;
      if (opt.textColor) optEl.style.color = opt.textColor;
      this.selectEl.appendChild(optEl);
    }
    const stillValid = Array.from(this.selectEl.options).some((o) => o.value === prevValue);
    this.selectEl.value = stillValid ? prevValue : '';
    this.selectEl.disabled = this.ctx.mode !== 'runtime' || prop.readonly === true;
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
