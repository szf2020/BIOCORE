import React from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { UplotChart } from '../../widgets-extras/UplotChart';
import type { UplotSeries } from '../../widgets-extras/UplotChart';
import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../gauge-base';
import type { FuxaWidget } from '../../models';

const BUFFER_WINDOW_MS = 60_000;

class HtmlChartGauge implements GaugeBase {
  private foreignObj: SVGForeignObjectElement | null = null;
  private mountDiv: HTMLDivElement | null = null;
  private reactRoot: Root | null = null;
  private dataBuffer: Array<Array<{ t: number; v: number }>> = [];
  private widget!: FuxaWidget;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 300;
    const h = (widget as any).h ?? 200;
    const variableIds = (widget.property as { variableIds?: string[] }).variableIds ?? [];
    this.dataBuffer = variableIds.map(() => []);

    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', String(x));
    fo.setAttribute('y', String(y));
    fo.setAttribute('width', String(w));
    fo.setAttribute('height', String(h));
    fo.setAttribute('data-widget-id', widget.id);

    const div = document.createElement('div');
    div.style.width = `${w}px`;
    div.style.height = `${h}px`;
    fo.appendChild(div);
    ctx.parentGroup.appendChild(fo);
    this.foreignObj = fo;
    this.mountDiv = div;

    try {
      this.reactRoot = createRoot(div);
      this._rerender(w, h);
    } catch { /* jsdom guard */ }
  }

  onUnmount(): void {
    this.reactRoot?.unmount();
    this.reactRoot = null;
    this.foreignObj?.remove();
    this.foreignObj = null;
    this.mountDiv = null;
  }

  onProcess(value: GaugeValue): void {
    if (value.isStale || value.value === null) return;
    const now = Date.now();
    const cutoff = now - BUFFER_WINDOW_MS;
    if (this.dataBuffer.length > 0) {
      this.dataBuffer[0]!.push({ t: now / 1000, v: Number(value.value) });
      this.dataBuffer[0] = this.dataBuffer[0]!.filter((pt) => pt.t * 1000 >= cutoff);
    }
    const w = Number(this.foreignObj?.getAttribute('width') ?? 300);
    const h = Number(this.foreignObj?.getAttribute('height') ?? 200);
    this._rerender(w, h);
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
    const w = Number(this.foreignObj?.getAttribute('width') ?? 300);
    const h = Number(this.foreignObj?.getAttribute('height') ?? 200);
    this._rerender(w, h);
  }

  onResize(w: number, h: number): void {
    if (!this.foreignObj || !this.mountDiv) return;
    this.foreignObj.setAttribute('width', String(w));
    this.foreignObj.setAttribute('height', String(h));
    this.mountDiv.style.width = `${w}px`;
    this.mountDiv.style.height = `${h}px`;
    this._rerender(w, h);
  }

  private _rerender(w: number, h: number): void {
    if (!this.reactRoot) return;
    const prop = this.widget.property as { title?: string };
    const series: UplotSeries[] = this.dataBuffer.map((buf, i) => ({
      x: buf.map((pt) => pt.t),
      y: buf.map((pt) => pt.v),
      label: `s${i}`,
      stroke: '#3b82f6',
    }));
    this.reactRoot.render(<UplotChart series={series} width={w} height={h} title={prop.title} />);
  }
}

export const htmlChartMeta: GaugeMeta = {
  widgetType: 'svg-ext-html_chart',
  create: () => new HtmlChartGauge(),
  getSignals: (w) => (w.property as { variableIds?: string[] }).variableIds ?? [],
};
