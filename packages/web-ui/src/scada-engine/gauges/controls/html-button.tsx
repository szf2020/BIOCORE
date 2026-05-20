// SP-FX-6: HtmlButtonGauge — click → ctx.onWriteIntent (runtime only).
// SP-FX-48.19: FUXA fidelity — icon/image + label, range bg/stroke color override,
// action system (blink/hide/show).

import type { GaugeBase, GaugeContext, GaugeClickContext, GaugeMeta, GaugePropChange, GaugeValue } from '../gauge-base';
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

interface ButtonProperty {
  variableId?: string;
  writeValue?: unknown;
  events?: Array<{ type?: string; actparam?: string; value?: unknown }>;
  label?: string;
  icon?: string;
  image?: string;
  bgColor?: string;
  textColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  ranges?: Range[];
  actions?: RangeAction[];
}

// SP-FX-FF.11: FUXA visual parity — bright blue bg, near-black text, "button"
// default label so unbound buttons look identical to FUXA's preview.
const DEFAULT_BG = '#3b82f6';
const DEFAULT_FG = '#0f172a';
const DEFAULT_LABEL = 'button';

class HtmlButtonGauge implements GaugeBase {
  private foreignObj: SVGForeignObjectElement | null = null;
  private htmlBtn: HTMLButtonElement | null = null;
  private iconEl: HTMLSpanElement | null = null;
  private imageEl: HTMLImageElement | null = null;
  private labelEl: HTMLSpanElement | null = null;
  private widget!: FuxaWidget;
  private ctx!: GaugeContext;
  private clickHandler: (() => void) | null = null;
  private actionRt: ActionRuntime = createActionRuntime();

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    this.ctx = ctx;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 100;
    const h = (widget as any).h ?? 36;

    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', String(x));
    fo.setAttribute('y', String(y));
    fo.setAttribute('width', String(w));
    fo.setAttribute('height', String(h));
    fo.setAttribute('data-widget-id', widget.id);

    const btn = document.createElement('button');
    btn.style.width = '100%';
    btn.style.height = '100%';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.gap = '6px';
    btn.style.cursor = ctx.mode === 'runtime' ? 'pointer' : 'default';
    btn.style.background = 'transparent';
    btn.style.padding = '0 8px';
    btn.style.font = 'inherit';
    btn.style.lineHeight = '1';
    // SP-FX-48.24: editor mode lets pointer events fall through to the SVG
    // canvas so widgets remain draggable; runtime mode keeps full interactivity.
    if (ctx.mode !== 'runtime') btn.style.pointerEvents = 'none';

    const prop = widget.property as ButtonProperty;

    // Image (if provided) takes priority over icon-font.
    if (prop.image) {
      const img = document.createElement('img');
      img.src = prop.image;
      img.alt = '';
      img.style.maxHeight = '70%';
      img.style.maxWidth = '40%';
      img.setAttribute('data-button-image', 'true');
      btn.appendChild(img);
      this.imageEl = img;
    } else if (prop.icon) {
      const span = document.createElement('span');
      span.className = 'material-icons';
      span.textContent = prop.icon;
      span.setAttribute('data-button-icon', 'true');
      btn.appendChild(span);
      this.iconEl = span;
    }

    const labelSpan = document.createElement('span');
    labelSpan.textContent = prop.label ?? DEFAULT_LABEL;
    labelSpan.setAttribute('data-button-label', 'true');
    btn.appendChild(labelSpan);
    this.labelEl = labelSpan;

    this._applyStyles(btn, prop);

    this.clickHandler = () => {
      if (this.ctx.mode !== 'runtime') return;
      const p = this.widget.property as ButtonProperty;
      const events = p.events ?? [];
      const evt = events.find((x) => x?.type === 'click');
      const tag = evt?.actparam ?? p.variableId;
      const value = evt?.value ?? p.writeValue;
      if (!tag) return;
      this.ctx.onWriteIntent?.({ tag, value, widgetId: this.widget.id });
    };
    btn.addEventListener('click', this.clickHandler);
    fo.appendChild(btn);
    ctx.parentGroup.appendChild(fo);
    this.foreignObj = fo;
    this.htmlBtn = btn;
  }

  onUnmount(): void {
    teardownActions(this.actionRt);
    if (this.htmlBtn && this.clickHandler) this.htmlBtn.removeEventListener('click', this.clickHandler);
    this.foreignObj?.remove();
    this.foreignObj = null;
    this.htmlBtn = null;
    this.iconEl = null;
    this.imageEl = null;
    this.labelEl = null;
    this.clickHandler = null;
  }

  onProcess(value: GaugeValue): void {
    if (!this.htmlBtn || !this.foreignObj) return;
    const prop = this.widget.property as ButtonProperty;
    this._applyStyles(this.htmlBtn, prop);

    if (!value.isStale && value.value !== null && value.value !== undefined) {
      const matched = matchRange(value.value, prop.ranges);
      if (matched?.color) this.htmlBtn.style.backgroundColor = matched.color;
      if (matched?.stroke) this.htmlBtn.style.borderColor = matched.stroke;
      if (matched?.textColor) this.htmlBtn.style.color = matched.textColor;
    }
    applyActions(value.value, prop.actions, this.foreignObj as unknown as SVGElement, this.actionRt);
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
    if (!this.htmlBtn) return;
    const prop = this.widget.property as ButtonProperty;
    if (this.labelEl) this.labelEl.textContent = prop.label ?? DEFAULT_LABEL;
    if (this.iconEl) this.iconEl.textContent = prop.icon ?? '';
    if (this.imageEl && prop.image) this.imageEl.src = prop.image;
    this._applyStyles(this.htmlBtn, prop);
  }

  onResize(w: number, h: number): void {
    if (!this.foreignObj) return;
    this.foreignObj.setAttribute('width', String(w));
    this.foreignObj.setAttribute('height', String(h));
  }

  onClick(_e: MouseEvent, c: GaugeClickContext): void {
    if (c.ctx.mode !== 'runtime') return;
    const prop = c.widget.property as ButtonProperty;
    const events = prop.events ?? [];
    const evt = events.find((x) => x?.type === 'click');
    const tag = evt?.actparam ?? prop.variableId;
    const value = evt?.value ?? prop.writeValue;
    if (!tag) return;
    c.ctx.onWriteIntent?.({ tag, value, widgetId: c.widget.id });
  }

  private _applyStyles(btn: HTMLButtonElement, prop: ButtonProperty): void {
    btn.style.backgroundColor = prop.bgColor ?? DEFAULT_BG;
    btn.style.color = prop.textColor ?? DEFAULT_FG;
    btn.style.borderStyle = 'solid';
    btn.style.borderColor = prop.borderColor ?? 'transparent';
    btn.style.borderWidth = `${prop.borderWidth ?? 0}px`;
    // SP-FX-FF.12: smaller rounded corners per user feedback ("圆角较小").
    btn.style.borderRadius = `${prop.borderRadius ?? 2}px`;
  }
}

export const htmlButtonMeta: GaugeMeta = {
  widgetType: 'svg-ext-html_button',
  create: () => new HtmlButtonGauge(),
  getSignals: (w) => {
    const v = (w.property as ButtonProperty).variableId;
    return v ? [v] : [];
  },
};
