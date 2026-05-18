// SP-FX-9 T10: HtmlImageGauge — foreignObject + img element.
// Supports static src or tag-bound dynamic src override.
// FUXA equivalent: svg-ext-html_img

import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

interface ImageProperty {
  src?: string;
  variableId?: string;
  fit?: 'contain' | 'cover' | 'fill';
  // SP-FX-48.10: optional color tint applied as mix-blend overlay
  tintColor?: string;
  tintOpacity?: number; // 0-1
}

class HtmlImageGauge implements GaugeBase {
  private foEl: SVGForeignObjectElement | null = null;
  private imgEl: HTMLImageElement | null = null;
  private widget!: FuxaWidget;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 120;
    const h = (widget as any).h ?? 80;
    const prop = widget.property as ImageProperty;

    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', String(x));
    fo.setAttribute('y', String(y));
    fo.setAttribute('width', String(w));
    fo.setAttribute('height', String(h));
    fo.setAttribute('data-widget-id', widget.id);

    // Wrap img in a positioned container so we can layer a tint overlay
    const wrap = document.createElement('div');
    wrap.style.position = 'relative';
    wrap.style.width = '100%';
    wrap.style.height = '100%';

    const img = document.createElement('img');
    img.setAttribute('src', prop.src ?? '');
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = prop.fit ?? 'contain';
    img.setAttribute('data-widget-id', widget.id);
    wrap.appendChild(img);

    if (prop.tintColor) {
      const overlay = document.createElement('div');
      overlay.dataset.tint = 'overlay';
      overlay.style.position = 'absolute';
      overlay.style.inset = '0';
      overlay.style.backgroundColor = prop.tintColor;
      overlay.style.opacity = String(Math.max(0, Math.min(1, prop.tintOpacity ?? 0.3)));
      overlay.style.mixBlendMode = 'multiply';
      overlay.style.pointerEvents = 'none';
      wrap.appendChild(overlay);
    }

    fo.appendChild(wrap);
    ctx.parentGroup.appendChild(fo);

    this.foEl = fo;
    this.imgEl = img;
  }

  onUnmount(): void {
    this.foEl?.remove();
    this.foEl = null;
    this.imgEl = null;
  }

  onProcess(value: GaugeValue): void {
    if (!this.imgEl) return;
    const prop = this.widget.property as ImageProperty;
    if (!prop.variableId) return;
    if (value.isStale || value.value === null) return;
    this.imgEl.setAttribute('src', String(value.value));
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
    const prop = this.widget.property as ImageProperty;
    if (this.imgEl) {
      if (prop.src !== undefined) {
        this.imgEl.setAttribute('src', prop.src);
      }
      if (prop.fit) {
        this.imgEl.style.objectFit = prop.fit;
      }
      // SP-FX-48.10: update tint overlay
      const wrap = this.imgEl.parentElement;
      const existing = wrap?.querySelector('[data-tint="overlay"]') as HTMLDivElement | null;
      if (prop.tintColor) {
        if (existing) {
          existing.style.backgroundColor = prop.tintColor;
          existing.style.opacity = String(Math.max(0, Math.min(1, prop.tintOpacity ?? 0.3)));
        } else if (wrap) {
          const overlay = document.createElement('div');
          overlay.dataset.tint = 'overlay';
          overlay.style.position = 'absolute';
          overlay.style.inset = '0';
          overlay.style.backgroundColor = prop.tintColor;
          overlay.style.opacity = String(Math.max(0, Math.min(1, prop.tintOpacity ?? 0.3)));
          overlay.style.mixBlendMode = 'multiply';
          overlay.style.pointerEvents = 'none';
          wrap.appendChild(overlay);
        }
      } else if (existing) {
        existing.remove();
      }
    }
  }

  onResize(w: number, h: number): void {
    if (!this.foEl) return;
    this.foEl.setAttribute('width', String(w));
    this.foEl.setAttribute('height', String(h));
  }
}

export const htmlImageMeta: GaugeMeta = {
  widgetType: 'svg-ext-html_img',
  create: () => new HtmlImageGauge(),
  getSignals: (w) => {
    const v = (w.property as ImageProperty).variableId;
    return v ? [v] : [];
  },
};
