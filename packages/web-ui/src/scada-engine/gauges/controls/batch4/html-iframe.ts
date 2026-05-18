// SP-FX-10 T2: HtmlIframeGauge — foreignObject + iframe with strict security sandbox.
// FUXA equivalent: svg-ext-html_iframe
// Security: sandbox="" (empty = most restrictive), src validated via URL constructor.

import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

interface IframeProperty {
  src?: string;
  title?: string;
}

function isValidUrl(src: string | undefined): boolean {
  if (!src) return false;
  try {
    const u = new URL(src);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

class HtmlIframeGauge implements GaugeBase {
  private foEl: SVGForeignObjectElement | null = null;
  private widget!: FuxaWidget;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 300;
    const h = (widget as any).h ?? 200;
    const prop = widget.property as IframeProperty;

    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', String(x));
    fo.setAttribute('y', String(y));
    fo.setAttribute('width', String(w));
    fo.setAttribute('height', String(h));
    fo.setAttribute('data-widget-id', widget.id);

    if (isValidUrl(prop.src)) {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', '');
      iframe.src = prop.src!;
      if (prop.title) iframe.title = prop.title;
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      fo.appendChild(iframe);
    } else {
      const div = document.createElement('div');
      div.setAttribute('data-invalid-src', 'true');
      div.style.width = '100%';
      div.style.height = '100%';
      div.style.display = 'flex';
      div.style.alignItems = 'center';
      div.style.justifyContent = 'center';
      div.style.backgroundColor = '#1e293b';
      div.style.color = '#ef4444';
      div.style.fontSize = '12px';
      div.textContent = '无效 URL';
      fo.appendChild(div);
    }

    ctx.parentGroup.appendChild(fo);
    this.foEl = fo;
  }

  onUnmount(): void {
    this.foEl?.remove();
    this.foEl = null;
  }

  onProcess(_value: GaugeValue): void {
    // No-op: iframe has no tag binding
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

export const htmlIframeMeta: GaugeMeta = {
  widgetType: 'svg-ext-html_iframe',
  create: () => new HtmlIframeGauge(),
  getSignals: (_w) => [],
};
