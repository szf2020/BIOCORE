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
  // SP-FX-48.21 (phase 3): inline SVG content overrides `src` when set.
  // Sanitized at render time: <script> tags + on* event attrs stripped.
  svgContent?: string;
}

// SP-FX-48.21: sanitize raw SVG markup before injecting via innerHTML. Strips
// <script> elements and any attribute starting with 'on' (event handlers).
// Renames all id="..." attributes by prefixing with the widget id to avoid
// collisions when multiple widgets share a source SVG.
function sanitizeSvgContent(raw: string, widgetId: string): string | null {
  if (typeof window === 'undefined' || !window.DOMParser) return null;
  const parser = new window.DOMParser();
  const doc = parser.parseFromString(raw, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() === 'parsererror') return null;
  const prefix = `${widgetId}__`;
  const walk = (node: Element) => {
    const tag = node.tagName.toLowerCase();
    if (tag === 'script') { node.remove(); return; }
    for (const attr of Array.from(node.attributes)) {
      const an = attr.name.toLowerCase();
      if (an.startsWith('on')) node.removeAttribute(attr.name);
      if ((an === 'href' || an === 'xlink:href') && /^\s*javascript:/i.test(attr.value)) {
        node.removeAttribute(attr.name);
      }
    }
    const idAttr = node.getAttribute('id');
    if (idAttr) node.setAttribute('id', prefix + idAttr);
    for (const child of Array.from(node.children)) walk(child);
  };
  walk(root);
  return new XMLSerializer().serializeToString(root);
}

class HtmlImageGauge implements GaugeBase {
  private foEl: SVGForeignObjectElement | null = null;
  private imgEl: HTMLImageElement | null = null;
  private svgHostEl: HTMLDivElement | null = null;
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

    // Wrap img/svg-host in a positioned container so we can layer a tint overlay
    const wrap = document.createElement('div');
    wrap.style.position = 'relative';
    wrap.style.width = '100%';
    wrap.style.height = '100%';

    // SP-FX-48.21: prefer inline svgContent when set, fall back to img/src.
    if (prop.svgContent && prop.svgContent.trim().length > 0) {
      const host = document.createElement('div');
      host.dataset.svgHost = 'true';
      host.style.width = '100%';
      host.style.height = '100%';
      const sanitized = sanitizeSvgContent(prop.svgContent, widget.id);
      if (sanitized) host.innerHTML = sanitized;
      wrap.appendChild(host);
      this.svgHostEl = host;
    } else {
      const img = document.createElement('img');
      img.setAttribute('src', prop.src ?? '');
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = prop.fit ?? 'contain';
      img.setAttribute('data-widget-id', widget.id);
      wrap.appendChild(img);
      this.imgEl = img;
    }

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
  }

  onUnmount(): void {
    this.foEl?.remove();
    this.foEl = null;
    this.imgEl = null;
    this.svgHostEl = null;
  }

  onProcess(value: GaugeValue): void {
    // SP-FX-48.21: only dynamic-src override applies when in img mode; svg-content
    // mode is static (no per-value re-parse to avoid runaway DOMParser cost).
    if (!this.imgEl) return;
    const prop = this.widget.property as ImageProperty;
    if (!prop.variableId) return;
    if (value.isStale || value.value === null) return;
    this.imgEl.setAttribute('src', String(value.value));
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
    const prop = this.widget.property as ImageProperty;
    if (this.svgHostEl && prop.svgContent !== undefined) {
      const sanitized = prop.svgContent ? sanitizeSvgContent(prop.svgContent, this.widget.id) : null;
      this.svgHostEl.innerHTML = sanitized ?? '';
    }
    if (this.imgEl) {
      if (prop.src !== undefined) {
        this.imgEl.setAttribute('src', prop.src);
      }
      if (prop.fit) {
        this.imgEl.style.objectFit = prop.fit;
      }
    }
    // SP-FX-48.10: update tint overlay (works regardless of img vs svg host)
    const wrap = (this.imgEl ?? this.svgHostEl)?.parentElement;
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
