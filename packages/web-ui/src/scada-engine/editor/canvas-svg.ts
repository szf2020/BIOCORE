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
    // SP-FX-3b.2.2: apply rotate transform on render. Omits transform when 0/undefined.
    const r = (widget as { rotate?: number }).rotate;
    if (typeof r === 'number' && r !== 0) {
      const cx = widget.x + widget.w / 2;
      const cy = widget.y + widget.h / 2;
      (el.node as SVGElement).setAttribute('transform', `rotate(${r} ${cx} ${cy})`);
    } else {
      (el.node as SVGElement).removeAttribute('transform');
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

  // SP-FX-3b.2.2: live rotate transform applied during drag-rotate FSM.
  applyRotate(id: string, deg: number, pivot: { x: number; y: number }): void {
    if (this.destroyed) return;
    const el = this.widgetMap.get(id);
    if (!el) return;
    if (deg === 0) (el.node as SVGElement).removeAttribute('transform');
    else (el.node as SVGElement).setAttribute('transform', `rotate(${deg} ${pivot.x} ${pivot.y})`);
  }

  getSvgRoot(): SVGSVGElement {
    return this.root.node as SVGSVGElement;
  }

  setGridVisible(visible: boolean, gridSize = 10): void {
    if (this.destroyed) return;
    const rootNode = this.root.node as SVGSVGElement;
    // Always remove existing grid (idempotent on re-true).
    const existingPattern = rootNode.querySelector('pattern[data-grid]');
    const existingRect = rootNode.querySelector('[data-overlay="grid"]');
    if (existingPattern) existingPattern.parentNode?.removeChild(existingPattern);
    if (existingRect) existingRect.parentNode?.removeChild(existingRect);
    if (!visible) return;

    // Build pattern inside <defs> (create defs if absent).
    let defs = rootNode.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      rootNode.insertBefore(defs, rootNode.firstChild);
    }
    const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    pattern.setAttribute('id', 'grid-pat');
    pattern.setAttribute('data-grid', String(gridSize));
    pattern.setAttribute('width', String(gridSize));
    pattern.setAttribute('height', String(gridSize));
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${gridSize} 0 L 0 0 0 ${gridSize}`);
    path.setAttribute('stroke', '#e5e7eb');
    path.setAttribute('fill', 'none');
    pattern.appendChild(path);
    defs.appendChild(pattern);

    // Insert grid rect as FIRST child of root (z=0, below widgetLayer/overlayLayer).
    const viewBoxAttr = rootNode.getAttribute('viewBox')?.split(' ').map(Number) ?? [0, 0, 800, 600];
    const vbW = viewBoxAttr[2] ?? 800;
    const vbH = viewBoxAttr[3] ?? 600;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', String(vbW));
    rect.setAttribute('height', String(vbH));
    rect.setAttribute('fill', 'url(#grid-pat)');
    rect.setAttribute('pointer-events', 'none');
    rect.setAttribute('data-overlay', 'grid');
    rootNode.insertBefore(rect, rootNode.firstChild);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.widgetMap.clear();
    this.root.remove();
  }
}
