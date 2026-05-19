// SP-FX-3a: svg.js wrapper for the editor canvas. Owns the root <svg> element
// and two layers: widgetLayer (FuxaWidget DOM) and overlayLayer (selection
// box + transform handles). Stateless wrt user interaction.

import { SVG, type Svg, type G, type Element as SvgElement } from '@svgdotjs/svg.js';
import type { FuxaView, FuxaWidget } from '../models';
import { gaugeRegistry } from '../gauges/gauge-registry';
import type { GaugeBase, GaugeContext, GaugeValue } from '../gauges/gauge-base';
// SP-FX-48.4: side-effect import — registers all 4 batches of gauges so the
// editor canvas can mount real widget visuals (matches runtime).
import '../gauges/controls/index';

// SP-FX-48.4: design-time stub for GaugeContext.readValue (no live data).
const EDITOR_GAUGE_VALUE: GaugeValue = { value: null, isStale: true };

export interface CanvasOpts {
  width: number;
  height: number;
  // SP-FX-48.15: optional inline text-edit hook. When provided, double-clicking
  // a 'text' widget on the canvas swaps in a foreignObject <input>; the callback
  // fires on Enter/blur with the committed value.
  onTextEdit?: (widgetId: string, nextText: string) => void;
}

function hasGeometry(w: FuxaWidget): w is FuxaWidget & { x: number; y: number; w: number; h: number } {
  return typeof (w as any).x === 'number'
    && typeof (w as any).y === 'number'
    && typeof (w as any).w === 'number'
    && typeof (w as any).h === 'number';
}

// SP-FX-48.17: flat point array [x0,y0,x1,y1,...] -> SVG polyline `points` attr.
function polylinePointsAttr(points: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    parts.push(`${points[i]},${points[i + 1]}`);
  }
  return parts.join(' ');
}

export class CanvasController {
  readonly root: Svg;
  readonly widgetLayer: G;
  readonly overlayLayer: G;
  private widgetMap = new Map<string, SvgElement>();
  // SP-FX-48.4: track gauge instances mounted in design mode so we can unmount
  // on remove and re-mount on update (lighter than implementing diff-based
  // gauge property propagation in the editor canvas).
  private gaugeMap = new Map<string, GaugeBase>();
  // SP-FX-48.6: snapshot of last-rendered widget shape per id; used to skip
  // gauge re-creation when EditorCanvas's items-effect re-upserts every widget
  // on each store update (avoids React "synchronous unmount during render"
  // warnings from html-chart/html-table which use createRoot internally).
  private widgetSnapshot = new Map<string, string>();
  private destroyed = false;
  private onTextEdit?: (id: string, text: string) => void;

  constructor(container: HTMLElement, opts: CanvasOpts) {
    if (opts.width <= 0 || opts.height <= 0) {
      throw new Error('invalid canvas size');
    }
    this.root = SVG().addTo(container).size(opts.width, opts.height).viewbox(0, 0, opts.width, opts.height);
    this.widgetLayer = this.root.group().attr('data-layer', 'widgets');
    this.overlayLayer = this.root.group().attr('data-layer', 'overlay');
    this.onTextEdit = opts.onTextEdit;
  }

  loadView(view: FuxaView): void {
    if (this.destroyed) return;
    for (const [, g] of this.gaugeMap) g.onUnmount();
    this.gaugeMap.clear();
    this.widgetSnapshot.clear();
    for (const [, el] of this.widgetMap) el.remove();
    this.widgetMap.clear();
    // SP-FX-48.8: apply view-level background color to SVG root + container.
    // Reads from FuxaView.background_color (preferred) or profile.bkcolor (legacy).
    const bg = (view as any).background_color
      ?? ((view as any).profile && (view as any).profile.bkcolor)
      ?? '';
    this.setBackgroundColor(bg);
    for (const id in view.items) {
      this.upsertWidget(view.items[id]);
    }
  }

  setBackgroundColor(color: string): void {
    if (this.destroyed) return;
    const node = this.root.node as SVGSVGElement;
    if (color) {
      node.style.background = color;
    } else {
      node.style.removeProperty('background');
    }
  }

  upsertWidget(widget: FuxaWidget): void {
    if (this.destroyed) return;
    if (!hasGeometry(widget)) {
      console.warn(`canvas-svg: skipping widget '${widget.id}' without geometry`);
      return;
    }
    let el = this.widgetMap.get(widget.id);
    // SP-FX-48.4: gauge widgets must be re-created on every upsert so geometry
    // updates flow through gauge.onMount. Remove via the public path first so
    // the rotate-transform code below always sees the fresh wrapper.
    // SP-FX-48.6: skip re-create when widget shape is unchanged — avoids
    // thrashing React roots inside foreignObject-based gauges (html-chart etc.).
    if (el && this.gaugeMap.has(widget.id)) {
      const snap = JSON.stringify({
        t: widget.type, x: widget.x, y: widget.y, w: widget.w, h: widget.h,
        r: (widget as { rotate?: number }).rotate ?? 0, p: widget.property,
      });
      if (this.widgetSnapshot.get(widget.id) === snap) return;
      this.widgetSnapshot.set(widget.id, snap);
      this.removeWidget(widget.id);
      el = undefined;
    } else if (!el) {
      this.widgetSnapshot.set(widget.id, JSON.stringify({
        t: widget.type, x: widget.x, y: widget.y, w: widget.w, h: widget.h,
        r: (widget as { rotate?: number }).rotate ?? 0, p: widget.property,
      }));
    }
    if (!el) {
      el = this.createElementForType(widget);
      this.widgetMap.set(widget.id, el);
    } else {
      this.updateElementForType(el, widget);
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

  private createElementForType(widget: FuxaWidget & { x: number; y: number; w: number; h: number }): SvgElement {
    switch (widget.type) {
      case 'ellipse': {
        const cx = widget.x + widget.w / 2;
        const cy = widget.y + widget.h / 2;
        const rx = widget.w / 2;
        const ry = widget.h / 2;
        return this.widgetLayer
          .ellipse(widget.w, widget.h)
          .attr({ cx, cy, rx, ry })
          .attr('data-widget-id', widget.id)
          .attr('fill', '#3b82f6')
          .attr('stroke', '#1e40af');
      }
      case 'text': {
        const cx = widget.x + widget.w / 2;
        const cy = widget.y + widget.h / 2;
        const content = ((widget.property as { text?: string }).text) ?? '文本';
        // Use raw DOM to avoid svg.js Text.bbox() which fails in jsdom.
        const node = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        node.setAttribute('x', String(cx));
        node.setAttribute('y', String(cy));
        node.setAttribute('text-anchor', 'middle');
        node.setAttribute('dominant-baseline', 'middle');
        node.setAttribute('data-widget-id', widget.id);
        node.setAttribute('fill', '#111827');
        node.setAttribute('font-size', '14');
        node.textContent = content;
        // SP-FX-48.15: double-click swaps a foreignObject <input> in place
        // so the operator can type directly on the canvas instead of hunting
        // for the 文字内容 field in the property panel.
        node.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          this.startInlineTextEdit(widget.id);
        });
        this.widgetLayer.node.appendChild(node);
        return SVG(node) as SvgElement;
      }
      case 'line': {
        const prop = widget.property as { stroke?: string; strokeWidth?: number };
        const node = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        node.setAttribute('x1', String(widget.x));
        node.setAttribute('y1', String(widget.y + widget.h / 2));
        node.setAttribute('x2', String(widget.x + widget.w));
        node.setAttribute('y2', String(widget.y + widget.h / 2));
        node.setAttribute('stroke', prop.stroke ?? '#111827');
        node.setAttribute('stroke-width', String(prop.strokeWidth ?? Math.max(1, widget.h)));
        node.setAttribute('data-widget-id', widget.id);
        this.widgetLayer.node.appendChild(node);
        return SVG(node) as SvgElement;
      }
      case 'pencil':
      case 'path': {
        const prop = widget.property as { points?: number[]; stroke?: string; strokeWidth?: number };
        const pts = (prop.points ?? []).slice();
        const pointsAttr = polylinePointsAttr(pts);
        const node = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        node.setAttribute('points', pointsAttr);
        node.setAttribute('stroke', prop.stroke ?? '#111827');
        node.setAttribute('stroke-width', String(prop.strokeWidth ?? 2));
        node.setAttribute('fill', 'none');
        node.setAttribute('stroke-linejoin', widget.type === 'pencil' ? 'round' : 'miter');
        node.setAttribute('stroke-linecap', 'round');
        node.setAttribute('data-widget-id', widget.id);
        this.widgetLayer.node.appendChild(node);
        return SVG(node) as SvgElement;
      }
      default: {
        // SP-FX-48.4: real gauge widgets (svg-ext-*) — delegate to GaugeRegistry
        // so the editor canvas matches runtime visuals (no more generic blocks).
        const gauge = gaugeRegistry.create(widget);
        if (gauge) {
          const groupNode = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          groupNode.setAttribute('data-widget-id', widget.id);
          this.widgetLayer.node.appendChild(groupNode);
          const ctx: GaugeContext = {
            parentGroup: groupNode as SVGGElement,
            readValue: () => EDITOR_GAUGE_VALUE,
            canvasSize: { width: 0, height: 0 },
            mode: 'editor',
          };
          gauge.onMount(widget, ctx);
          // SP-FX-48.4: gauges set data-widget-id on their inner elements for
          // runtime click delegation. In the editor, the wrapper <g> is the
          // canonical selection anchor — strip inner duplicates so selection
          // queries return exactly one element per widget. Re-apply wrapper id
          // last (defensive against any gauge code that touches the parent).
          for (const inner of Array.from(groupNode.querySelectorAll('[data-widget-id]'))) {
            inner.removeAttribute('data-widget-id');
          }
          groupNode.setAttribute('data-widget-id', widget.id);
          this.gaugeMap.set(widget.id, gauge);
          return SVG(groupNode) as SvgElement;
        }
        // legacy / unknown types → rect render
        return this.widgetLayer
          .rect(widget.w, widget.h)
          .attr({ x: widget.x, y: widget.y })
          .attr('data-widget-id', widget.id)
          .attr('fill', '#3b82f6')
          .attr('stroke', '#1e40af');
      }
    }
  }

  private updateElementForType(el: SvgElement, widget: FuxaWidget & { x: number; y: number; w: number; h: number }): void {
    switch (widget.type) {
      case 'ellipse': {
        const cx = widget.x + widget.w / 2;
        const cy = widget.y + widget.h / 2;
        el.attr({ cx, cy, rx: widget.w / 2, ry: widget.h / 2 });
        break;
      }
      case 'text': {
        const cx = widget.x + widget.w / 2;
        const cy = widget.y + widget.h / 2;
        const content = ((widget.property as { text?: string }).text) ?? '文本';
        el.attr({ x: cx, y: cy });
        (el.node as SVGTextElement).textContent = content;
        break;
      }
      case 'line': {
        const prop = widget.property as { stroke?: string; strokeWidth?: number };
        const node = el.node as SVGLineElement;
        node.setAttribute('x1', String(widget.x));
        node.setAttribute('y1', String(widget.y + widget.h / 2));
        node.setAttribute('x2', String(widget.x + widget.w));
        node.setAttribute('y2', String(widget.y + widget.h / 2));
        if (prop.stroke) node.setAttribute('stroke', prop.stroke);
        if (prop.strokeWidth != null) node.setAttribute('stroke-width', String(prop.strokeWidth));
        break;
      }
      case 'pencil':
      case 'path': {
        const prop = widget.property as { points?: number[]; stroke?: string; strokeWidth?: number };
        const node = el.node as SVGPolylineElement;
        node.setAttribute('points', polylinePointsAttr(prop.points ?? []));
        if (prop.stroke) node.setAttribute('stroke', prop.stroke);
        if (prop.strokeWidth != null) node.setAttribute('stroke-width', String(prop.strokeWidth));
        break;
      }
      default: {
        // SP-FX-48.4: gauge widget update — unmount old, recreate at new geometry.
        const gauge = this.gaugeMap.get(widget.id);
        if (gauge) {
          gauge.onUnmount();
          this.gaugeMap.delete(widget.id);
          el.remove();
          this.widgetMap.delete(widget.id);
          const replacement = this.createElementForType(widget);
          this.widgetMap.set(widget.id, replacement);
          break;
        }
        el.attr({ x: widget.x, y: widget.y, width: widget.w, height: widget.h });
      }
    }
  }

  removeWidget(id: string): void {
    if (this.destroyed) return;
    const gauge = this.gaugeMap.get(id);
    if (gauge) {
      gauge.onUnmount();
      this.gaugeMap.delete(id);
    }
    this.widgetSnapshot.delete(id);
    const el = this.widgetMap.get(id);
    if (!el) return;
    el.remove();
    this.widgetMap.delete(id);
  }

  getElement(id: string): SvgElement | undefined {
    return this.widgetMap.get(id);
  }

  getWidgetIds(): string[] {
    return Array.from(this.widgetMap.keys());
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
    for (const [, g] of this.gaugeMap) g.onUnmount();
    this.gaugeMap.clear();
    this.widgetSnapshot.clear();
    this.widgetMap.clear();
    this.root.remove();
  }

  // SP-FX-48.17: live drawing preview rendered on overlayLayer.
  // - kind='polyline' for pencil/path (uses point list as-is)
  // - kind='ellipse' for ellipse-draw (points = [x1,y1,x2,y2] bbox corners)
  showDrawPreview(kind: 'polyline' | 'ellipse', points: number[]): void {
    if (this.destroyed) return;
    let preview = (this.overlayLayer.node as SVGGElement).querySelector('[data-overlay="draw-preview"]') as SVGElement | null;
    if (preview && preview.getAttribute('data-kind') !== kind) {
      preview.remove();
      preview = null;
    }
    if (kind === 'polyline') {
      if (!preview) {
        preview = document.createElementNS('http://www.w3.org/2000/svg', 'polyline') as unknown as SVGElement;
        preview.setAttribute('data-overlay', 'draw-preview');
        preview.setAttribute('data-kind', 'polyline');
        preview.setAttribute('fill', 'none');
        preview.setAttribute('stroke', '#3b82f6');
        preview.setAttribute('stroke-width', '2');
        preview.setAttribute('stroke-dasharray', '4 2');
        preview.setAttribute('pointer-events', 'none');
        this.overlayLayer.node.appendChild(preview);
      }
      preview.setAttribute('points', polylinePointsAttr(points));
      return;
    }
    // ellipse preview: bbox from [x1,y1,x2,y2]
    if (points.length < 4) return;
    if (!preview) {
      preview = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse') as unknown as SVGElement;
      preview.setAttribute('data-overlay', 'draw-preview');
      preview.setAttribute('data-kind', 'ellipse');
      preview.setAttribute('fill', 'rgba(59,130,246,0.1)');
      preview.setAttribute('stroke', '#3b82f6');
      preview.setAttribute('stroke-width', '2');
      preview.setAttribute('stroke-dasharray', '4 2');
      preview.setAttribute('pointer-events', 'none');
      this.overlayLayer.node.appendChild(preview);
    }
    const x1 = points[0];
    const y1 = points[1];
    const x2 = points[2];
    const y2 = points[3];
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const rx = Math.abs(x2 - x1) / 2;
    const ry = Math.abs(y2 - y1) / 2;
    preview.setAttribute('cx', String(cx));
    preview.setAttribute('cy', String(cy));
    preview.setAttribute('rx', String(rx));
    preview.setAttribute('ry', String(ry));
  }

  hideDrawPreview(): void {
    if (this.destroyed) return;
    const preview = (this.overlayLayer.node as SVGGElement).querySelector('[data-overlay="draw-preview"]');
    preview?.remove();
  }

  // SP-FX-48.15: swap the SVG <text> for a foreignObject <input> at the same
  // geometry so the user can type directly on the canvas. Commit on Enter/blur,
  // cancel on Esc. The callback (set via opts.onTextEdit) writes back to the
  // store; the upsertWidget that follows re-renders the SVG <text> at the new
  // value, replacing the foreignObject.
  startInlineTextEdit(widgetId: string): void {
    if (this.destroyed || !this.onTextEdit) return;
    const el = this.widgetMap.get(widgetId);
    if (!el) return;
    const node = el.node as SVGTextElement;
    if (node.tagName.toLowerCase() !== 'text') return;
    const x = parseFloat(node.getAttribute('x') ?? '0');
    const y = parseFloat(node.getAttribute('y') ?? '0');
    const initial = node.textContent ?? '';
    // Estimate width via a generous box; height = font-size + padding.
    const boxW = Math.max(120, initial.length * 14);
    const boxH = 28;
    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', String(x - boxW / 2));
    fo.setAttribute('y', String(y - boxH / 2));
    fo.setAttribute('width', String(boxW));
    fo.setAttribute('height', String(boxH));
    fo.setAttribute('data-inline-edit', widgetId);
    const input = document.createElement('input');
    input.type = 'text';
    input.value = initial;
    input.style.width = '100%';
    input.style.height = '100%';
    input.style.boxSizing = 'border-box';
    input.style.border = '1px solid #3b82f6';
    input.style.background = '#ffffff';
    input.style.color = '#111827';
    input.style.font = '14px sans-serif';
    input.style.padding = '0 4px';
    input.style.textAlign = 'center';
    fo.appendChild(input);
    this.widgetLayer.node.appendChild(fo);
    node.setAttribute('visibility', 'hidden');

    let committed = false;
    const cleanup = () => {
      fo.remove();
      node.removeAttribute('visibility');
    };
    const commit = () => {
      if (committed) return;
      committed = true;
      const next = input.value;
      cleanup();
      if (next !== initial) this.onTextEdit?.(widgetId, next);
    };
    const cancel = () => {
      if (committed) return;
      committed = true;
      cleanup();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', () => commit());
    requestAnimationFrame(() => { input.focus(); input.select(); });
  }
}
