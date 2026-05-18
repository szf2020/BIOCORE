// SP-FX-48.7: HtmlVideoGauge — <video> element via foreignObject.
// FUXA equivalent: html-video
// Property: src (URL, http(s) only), autoplay, loop, muted, controls.
// Security: URL validated via URL constructor; only http(s) protocols accepted.

import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

interface VideoProperty {
  src?: string;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;
}

function isValidVideoUrl(src: string | undefined): boolean {
  if (!src) return false;
  try {
    const u = new URL(src);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

class HtmlVideoGauge implements GaugeBase {
  private foEl: SVGForeignObjectElement | null = null;
  private widget!: FuxaWidget;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 320;
    const h = (widget as any).h ?? 180;
    const prop = (widget.property ?? {}) as VideoProperty;

    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', String(x));
    fo.setAttribute('y', String(y));
    fo.setAttribute('width', String(w));
    fo.setAttribute('height', String(h));
    fo.setAttribute('data-widget-id', widget.id);

    if (isValidVideoUrl(prop.src)) {
      const video = document.createElement('video');
      video.src = prop.src!;
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'contain';
      if (prop.autoplay) video.autoplay = true;
      if (prop.loop) video.loop = true;
      if (prop.muted) video.muted = true;
      if (prop.controls ?? true) video.controls = true;
      video.setAttribute('preload', 'metadata');
      fo.appendChild(video);
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
      div.textContent = '无效视频 URL';
      fo.appendChild(div);
    }

    ctx.parentGroup.appendChild(fo);
    this.foEl = fo;
  }

  onUnmount(): void {
    // Pause + detach src so background-loaded video stops streaming on remove
    const video = this.foEl?.querySelector('video') as HTMLVideoElement | null;
    if (video) { try { video.pause(); video.removeAttribute('src'); video.load(); } catch { /* ignore */ } }
    this.foEl?.remove();
    this.foEl = null;
  }

  onProcess(_value: GaugeValue): void {
    // No-op: video has no tag binding
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

export const htmlVideoMeta: GaugeMeta = {
  widgetType: 'svg-ext-html_video',
  create: () => new HtmlVideoGauge(),
  getSignals: (_w) => [],
};
