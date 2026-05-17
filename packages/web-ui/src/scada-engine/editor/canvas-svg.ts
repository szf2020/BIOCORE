// SP-FX-3a: svg.js wrapper for the editor canvas. Owns the root <svg> element
// and two layers: widgetLayer (FuxaWidget DOM) and overlayLayer (selection
// box + transform handles). Stateless wrt user interaction.

import { SVG, type Svg, type G, type Element as SvgElement } from '@svgdotjs/svg.js';
import type { FuxaView, FuxaWidget } from '../models';

export interface CanvasOpts {
  width: number;
  height: number;
}

function hasGeometry(w: FuxaWidget): w is FuxaWidget & { x: number; y: number; w: number; h: number } {
  return typeof (w as any).x === 'number'
    && typeof (w as any).y === 'number'
    && typeof (w as any).w === 'number'
    && typeof (w as any).h === 'number';
}

export class CanvasController {
  readonly root: Svg;
  readonly widgetLayer: G;
  readonly overlayLayer: G;
  private widgetMap = new Map<string, SvgElement>();
  private destroyed = false;

  constructor(container: HTMLElement, opts: CanvasOpts) {
    if (opts.width <= 0 || opts.height <= 0) {
      throw new Error('invalid canvas size');
    }
    this.root = SVG().addTo(container).size(opts.width, opts.height).viewbox(0, 0, opts.width, opts.height);
    this.widgetLayer = this.root.group().attr('data-layer', 'widgets');
    this.overlayLayer = this.root.group().attr('data-layer', 'overlay');
  }

  loadView(view: FuxaView): void {
    if (this.destroyed) return;
    for (const [, el] of this.widgetMap) el.remove();
    this.widgetMap.clear();
    for (const id in view.items) {
      this.upsertWidget(view.items[id]);
    }
  }

  upsertWidget(widget: FuxaWidget): void {
    if (this.destroyed) return;
    if (!hasGeometry(widget)) {
      console.warn(`canvas-svg: skipping widget '${widget.id}' without geometry`);
      return;
    }
    let el = this.widgetMap.get(widget.id);
    if (!el) {
      el = this.widgetLayer
        .rect(widget.w, widget.h)
        .attr({ x: widget.x, y: widget.y })
        .attr('data-widget-id', widget.id)
        .attr('fill', '#3b82f6')
        .attr('stroke', '#1e40af');
      this.widgetMap.set(widget.id, el);
    } else {
      el.attr({ x: widget.x, y: widget.y, width: widget.w, height: widget.h });
    }
  }

  removeWidget(id: string): void {
    if (this.destroyed) return;
    const el = this.widgetMap.get(id);
    if (!el) return;
    el.remove();
    this.widgetMap.delete(id);
  }

  getElement(id: string): SvgElement | undefined {
    return this.widgetMap.get(id);
  }

  getSvgRoot(): SVGSVGElement {
    return this.root.node as SVGSVGElement;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.widgetMap.clear();
    this.root.remove();
  }
}
