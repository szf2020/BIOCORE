// SP-FX-3a: selection overlay — 8 resize handles + 1 rotate placeholder + dashed
// selection rect. Owned by an svg.js group passed in by the canvas.

import type { G, Rect, Line } from '@svgdotjs/svg.js';
import { handlePositions, handleFromPoint, type Box, type HandleId } from './geometry';

const HANDLE_SIZE = 8;
const HANDLE_HALF = HANDLE_SIZE / 2;

const BBOX_CORNER_SIZE = 4;
const BBOX_DASH = '6 3';

export class TransformHandles {
  private group: G;
  private selectionRect: Rect;
  private handles: Record<HandleId, Rect>;
  private bboxCorners: Rect[];
  private currentBox: Box | null = null;
  private currentRotate: number | undefined = undefined;
  private visible = false;
  private mode: 'single' | 'bbox' = 'single';

  constructor(overlay: G) {
    this.group = overlay.group().attr('data-overlay', 'transform').attr('visibility', 'hidden');
    this.selectionRect = this.group.rect(0, 0)
      .attr('data-overlay-part', 'selection-rect')
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-dasharray', '4 2');
    this.handles = {} as Record<HandleId, Rect>;
    for (const id of ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se', 'rotate'] as HandleId[]) {
      const r = this.group.rect(HANDLE_SIZE, HANDLE_SIZE)
        .attr('data-handle', id)
        .attr('fill', id === 'rotate' ? '#10b981' : '#ffffff')
        .attr('stroke', '#3b82f6');
      this.handles[id] = r;
    }
    this.bboxCorners = [];
    for (let i = 0; i < 4; i++) {
      const r = this.group.rect(BBOX_CORNER_SIZE, BBOX_CORNER_SIZE)
        .attr('data-bbox-corner', String(i))
        .attr('fill', '#3b82f6')
        .attr('visibility', 'hidden');
      this.bboxCorners.push(r);
    }
    // Ensure bbox mode lays out from a known-good axis-aligned group
  }

  show(box: Box, rotate?: number): void {
    this.currentBox = box;
    this.currentRotate = rotate;
    this.visible = true;
    this.mode = 'single';
    this.group.attr('visibility', 'visible');
    this.selectionRect.attr('stroke-dasharray', '4 2');
    for (const id of ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se', 'rotate'] as HandleId[]) {
      this.handles[id].attr('visibility', 'visible');
    }
    for (const c of this.bboxCorners) c.attr('visibility', 'hidden');
    this.layout(box);
    this.applyRotation(box, rotate);
  }

  showBbox(bbox: Box): void {
    this.currentBox = bbox;
    this.currentRotate = undefined;
    this.visible = true;
    this.mode = 'bbox';
    this.group.attr('visibility', 'visible');
    this.selectionRect.attr('stroke-dasharray', BBOX_DASH);
    // SP-FX-3b.2.3: all 9 handles visible in bbox mode for group-resize / group-rotate
    for (const id of ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se', 'rotate'] as HandleId[]) {
      this.handles[id].attr('visibility', 'visible');
    }
    for (const c of this.bboxCorners) c.attr('visibility', 'visible');
    this.layoutBbox(bbox);
    // SP-FX-48.23: bbox mode = axis-aligned multi-selection; clear any prior
    // single-rotation transform on the group.
    (this.group.node as SVGGElement).removeAttribute('transform');
  }

  private layoutBbox(bbox: Box): void {
    this.selectionRect.attr('x', bbox.x).attr('y', bbox.y).attr('width', bbox.w).attr('height', bbox.h);
    const half = BBOX_CORNER_SIZE / 2;
    this.bboxCorners[0].attr('x', bbox.x - half).attr('y', bbox.y - half);
    this.bboxCorners[1].attr('x', bbox.x + bbox.w - half).attr('y', bbox.y - half);
    this.bboxCorners[2].attr('x', bbox.x - half).attr('y', bbox.y + bbox.h - half);
    this.bboxCorners[3].attr('x', bbox.x + bbox.w - half).attr('y', bbox.y + bbox.h - half);
    // SP-FX-3b.2.3: position 9 handles (8 resize + rotate) at bbox edges
    const positions = handlePositions(bbox);
    for (const id in positions) {
      const p = positions[id as HandleId];
      this.handles[id as HandleId].attr('x', p.x - HANDLE_HALF).attr('y', p.y - HANDLE_HALF);
    }
  }

  hide(): void {
    this.visible = false;
    this.currentBox = null;
    this.currentRotate = undefined;
    this.mode = 'single';
    this.group.attr('visibility', 'hidden');
    (this.group.node as SVGGElement).removeAttribute('transform');
    // SVG visibility="visible" on a child overrides "hidden" on its parent,
    // so the group attr alone won't conceal handles that were previously
    // shown via show()/showBbox(). Reset every individual handle + corner.
    for (const id in this.handles) {
      this.handles[id as HandleId].attr('visibility', 'hidden');
    }
    for (const c of this.bboxCorners) c.attr('visibility', 'hidden');
  }

  updateBox(box: Box, rotate?: number): void {
    this.currentBox = box;
    if (this.mode === 'bbox') this.layoutBbox(box);
    else this.layout(box);
    if (this.mode === 'single') {
      // SP-FX-48.23: preserve current rotation across drag/resize updates;
      // explicit rotate=0 clears (caller intent), undefined keeps current.
      const r = rotate !== undefined ? rotate : this.currentRotate;
      this.currentRotate = r;
      this.applyRotation(box, r);
    }
  }

  // SP-FX-48.23: rotate the entire handle group around the widget's center
  // so the selection chrome tracks the rotated widget. Passing undefined or 0
  // clears the transform (axis-aligned).
  private applyRotation(box: Box, rotate?: number): void {
    const node = this.group.node as SVGGElement;
    if (typeof rotate === 'number' && rotate !== 0) {
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      node.setAttribute('transform', `rotate(${rotate} ${cx} ${cy})`);
    } else {
      node.removeAttribute('transform');
    }
  }

  hitTest(pt: { x: number; y: number }): HandleId | null {
    if (!this.visible || !this.currentBox) return null;
    // SP-FX-48.23: when handles are rotated, un-rotate the hit point around the
    // widget center so axis-aligned handle bbox checks still work.
    if (this.mode === 'single' && typeof this.currentRotate === 'number' && this.currentRotate !== 0) {
      const cx = this.currentBox.x + this.currentBox.w / 2;
      const cy = this.currentBox.y + this.currentBox.h / 2;
      const rad = (-this.currentRotate * Math.PI) / 180;
      const dx = pt.x - cx;
      const dy = pt.y - cy;
      const lx = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
      const ly = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
      return handleFromPoint(this.currentBox, { x: lx, y: ly });
    }
    return handleFromPoint(this.currentBox, pt);
  }

  private layout(box: Box): void {
    this.selectionRect.attr('x', box.x).attr('y', box.y).attr('width', box.w).attr('height', box.h);
    const positions = handlePositions(box);
    for (const id in positions) {
      const p = positions[id as HandleId];
      this.handles[id as HandleId].attr('x', p.x - HANDLE_HALF).attr('y', p.y - HANDLE_HALF);
    }
  }
}

// SP-FX-3b.2.1: drag-time visual hint — H/V dashed lines through snapped corner.

export class SnapGuides {
  private group: G;
  private hLine: Line;
  private vLine: Line;
  private destroyed = false;

  constructor(overlay: G) {
    this.group = overlay.group().attr('data-overlay', 'snap-guides').attr('visibility', 'hidden');
    this.hLine = this.group.line(0, 0, 0, 0)
      .attr('data-guide', 'h')
      .attr('stroke', '#ec4899')
      .attr('stroke-dasharray', '3 2')
      .attr('stroke-width', 1)
      .attr('pointer-events', 'none');
    this.vLine = this.group.line(0, 0, 0, 0)
      .attr('data-guide', 'v')
      .attr('stroke', '#ec4899')
      .attr('stroke-dasharray', '3 2')
      .attr('stroke-width', 1)
      .attr('pointer-events', 'none');
  }

  show(snappedBox: Box, viewBox: { w: number; h: number }): void {
    if (this.destroyed) return;
    this.hLine.attr('x1', 0).attr('y1', snappedBox.y).attr('x2', viewBox.w).attr('y2', snappedBox.y);
    this.vLine.attr('x1', snappedBox.x).attr('y1', 0).attr('x2', snappedBox.x).attr('y2', viewBox.h);
    this.group.attr('visibility', 'visible');
  }

  hide(): void {
    if (this.destroyed) return;
    this.group.attr('visibility', 'hidden');
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.group.remove();
  }
}

// SP-FX-3b.2.2: rotate-drag tooltip — SVG <text> overlay near pivot showing current angle.

export class RotateTooltip {
  private group: G;
  private textElement: SVGTextElement;
  private destroyed = false;

  constructor(overlay: G) {
    this.group = overlay.group().attr('data-overlay', 'rotate-tooltip').attr('visibility', 'hidden');
    // Create raw SVG text element to avoid svg.js bbox computation in jsdom
    this.textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    this.textElement.setAttribute('data-rotate-text', '');
    this.textElement.setAttribute('fill', '#3b82f6');
    this.textElement.setAttribute('font-size', '11');
    this.textElement.setAttribute('font-family', 'monospace');
    this.textElement.setAttribute('pointer-events', 'none');
    this.group.node.appendChild(this.textElement);
  }

  show(deg: number, pivot: { x: number; y: number }): void {
    if (this.destroyed) return;
    const degStr = `${deg.toFixed(1)}°`;
    this.textElement.textContent = degStr;
    this.textElement.setAttribute('x', String(pivot.x + 12));
    this.textElement.setAttribute('y', String(pivot.y - 4));
    this.group.attr('visibility', 'visible');
  }

  hide(): void {
    if (this.destroyed) return;
    this.group.attr('visibility', 'hidden');
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.group.remove();
  }
}
