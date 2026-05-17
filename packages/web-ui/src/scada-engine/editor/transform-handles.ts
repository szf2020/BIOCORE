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
  }

  show(box: Box): void {
    this.currentBox = box;
    this.visible = true;
    this.mode = 'single';
    this.group.attr('visibility', 'visible');
    this.selectionRect.attr('stroke-dasharray', '4 2');
    for (const id of ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se', 'rotate'] as HandleId[]) {
      this.handles[id].attr('visibility', 'visible');
    }
    for (const c of this.bboxCorners) c.attr('visibility', 'hidden');
    this.layout(box);
  }

  showBbox(bbox: Box): void {
    this.currentBox = bbox;
    this.visible = true;
    this.mode = 'bbox';
    this.group.attr('visibility', 'visible');
    this.selectionRect.attr('stroke-dasharray', BBOX_DASH);
    for (const id of ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se', 'rotate'] as HandleId[]) {
      this.handles[id].attr('visibility', 'hidden');
    }
    for (const c of this.bboxCorners) c.attr('visibility', 'visible');
    this.layoutBbox(bbox);
  }

  private layoutBbox(bbox: Box): void {
    this.selectionRect.attr('x', bbox.x).attr('y', bbox.y).attr('width', bbox.w).attr('height', bbox.h);
    const half = BBOX_CORNER_SIZE / 2;
    this.bboxCorners[0].attr('x', bbox.x - half).attr('y', bbox.y - half);
    this.bboxCorners[1].attr('x', bbox.x + bbox.w - half).attr('y', bbox.y - half);
    this.bboxCorners[2].attr('x', bbox.x - half).attr('y', bbox.y + bbox.h - half);
    this.bboxCorners[3].attr('x', bbox.x + bbox.w - half).attr('y', bbox.y + bbox.h - half);
  }

  hide(): void {
    this.visible = false;
    this.currentBox = null;
    this.mode = 'single';
    this.group.attr('visibility', 'hidden');
    for (const c of this.bboxCorners) c.attr('visibility', 'hidden');
  }

  updateBox(box: Box): void {
    this.currentBox = box;
    if (this.mode === 'bbox') this.layoutBbox(box);
    else this.layout(box);
  }

  hitTest(pt: { x: number; y: number }): HandleId | null {
    if (!this.visible || !this.currentBox) return null;
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
