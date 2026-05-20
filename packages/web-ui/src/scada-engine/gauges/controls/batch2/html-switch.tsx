// SP-FX-6.2: HtmlSwitchGauge — foreignObject + checkbox toggle → ctx.onWriteIntent.
// FUXA equivalent: svg-ext-html_switch

import type { GaugeBase, GaugeClickContext, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

interface SwitchProperty {
  variableId?: string;
  onValue?: number | string;
  offValue?: number | string;
  bitmask?: number; // bit 位号 0-31，存在时启用 bitmask 模式
}

// SP-FX-FF.15: FUXA two-half toggle look. Visible halves render via plain
// HTML divs; behavior + a11y still backed by a hidden <input type=checkbox>
// inside a <label> wrapper so click-anywhere toggles the input natively and
// existing tests (which find input[type=checkbox]) keep passing.
const OFF_ACTIVE_BG = '#ffffff';
const OFF_INACTIVE_BG = '#e2e8f0';
const ON_ACTIVE_BG = '#cbd5e1';
const ON_INACTIVE_BG = '#f1f5f9';
const BORDER_COLOR = '#94a3b8';

class HtmlSwitchGauge implements GaugeBase {
  private foreignObj: SVGForeignObjectElement | null = null;
  private checkbox: HTMLInputElement | null = null;
  private offHalf: HTMLDivElement | null = null;
  private onHalf: HTMLDivElement | null = null;
  private widget!: FuxaWidget;
  private ctx!: GaugeContext;
  private changeHandler: (() => void) | null = null;

  private applyHalfColors(checked: boolean): void {
    if (!this.offHalf || !this.onHalf) return;
    this.offHalf.style.backgroundColor = checked ? OFF_INACTIVE_BG : OFF_ACTIVE_BG;
    this.onHalf.style.backgroundColor = checked ? ON_ACTIVE_BG : ON_INACTIVE_BG;
  }

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    this.ctx = ctx;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 120;
    const h = (widget as any).h ?? 40;

    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', String(x));
    fo.setAttribute('y', String(y));
    fo.setAttribute('width', String(w));
    fo.setAttribute('height', String(h));
    fo.setAttribute('data-widget-id', widget.id);

    // <label> wraps two halves + hidden checkbox so a click anywhere on the
    // visible widget toggles the underlying input natively.
    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.width = '100%';
    label.style.height = '100%';
    label.style.border = `1px solid ${BORDER_COLOR}`;
    label.style.boxSizing = 'border-box';
    label.style.cursor = ctx.mode === 'runtime' ? 'pointer' : 'default';
    if (ctx.mode !== 'runtime') label.style.pointerEvents = 'none';

    const offHalf = document.createElement('div');
    offHalf.dataset['half'] = 'off';
    offHalf.style.flex = '1';
    offHalf.style.backgroundColor = OFF_ACTIVE_BG;
    offHalf.style.borderRight = `1px solid ${BORDER_COLOR}`;
    this.offHalf = offHalf;

    const onHalf = document.createElement('div');
    onHalf.dataset['half'] = 'on';
    onHalf.style.flex = '1';
    onHalf.style.backgroundColor = ON_INACTIVE_BG;
    this.onHalf = onHalf;

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.style.display = 'none';
    input.disabled = ctx.mode !== 'runtime';

    // SP-FX-FF.8: ColorPaletteBar tints the border + active-on half.
    const accent = (widget.property as { color?: string }).color;
    if (accent) {
      label.style.borderColor = accent;
      offHalf.style.borderRightColor = accent;
      input.style.accentColor = accent;
    }

    this.changeHandler = () => {
      if (this.ctx.mode === 'runtime') {
        const prop = this.widget.property as SwitchProperty;
        const tag = prop.variableId;
        if (tag) {
          if (prop.bitmask !== undefined) {
            const bit = prop.bitmask;
            const current = this.ctx.readValue(tag);
            const currentNum = typeof current.value === 'number'
              ? current.value
              : parseInt(String(current.value ?? '0'), 10);
            const newVal = input.checked
              ? currentNum | (1 << bit)
              : currentNum & ~(1 << bit);
            this.ctx.onWriteIntent?.({ tag, value: newVal, widgetId: this.widget.id });
          } else {
            const val = input.checked ? (prop.onValue ?? 1) : (prop.offValue ?? 0);
            this.ctx.onWriteIntent?.({ tag, value: val, widgetId: this.widget.id });
          }
        }
      }
      this.applyHalfColors(input.checked);
    };
    input.addEventListener('change', this.changeHandler);

    label.appendChild(offHalf);
    label.appendChild(onHalf);
    label.appendChild(input);
    fo.appendChild(label);
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
    this.offHalf = null;
    this.onHalf = null;
    this.changeHandler = null;
  }

  onProcess(value: GaugeValue): void {
    if (!this.checkbox) return;
    if (value.isStale || value.value === null) {
      this.checkbox.checked = false;
      this.applyHalfColors(false);
      return;
    }
    const prop = this.widget.property as SwitchProperty;

    if (prop.bitmask !== undefined) {
      // bitmask 模式: (numVal >> bit) & 1
      const bit = prop.bitmask;
      const numVal = typeof value.value === 'number'
        ? value.value
        : parseInt(String(value.value), 10);
      this.checkbox.checked = ((numVal >> bit) & 1) === 1;
    } else {
      const onVal = String(prop.onValue ?? '1');
      this.checkbox.checked = String(value.value) === onVal;
    }
    this.applyHalfColors(this.checkbox.checked);
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
