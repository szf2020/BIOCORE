// SP-FX-3a: selection overlay — 8 resize handles + 1 rotate placeholder + dashed
// selection rect. Owned by an svg.js group passed in by the canvas.

import type { G, Rect } from '@svgdotjs/svg.js';
import { handlePositions, handleFromPoint, type Box, type HandleId } from './geometry';

const HANDLE_SIZE = 8;
const HANDLE_HALF = HANDLE_SIZE / 2;

export class TransformHandles {
  private group: G;
  private selectionRect: Rect;
  private handles: Record<HandleId, Rect>;
  private currentBox: Box | null = null;
  private visible = false;

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
  }

  show(box: Box): void {
    this.currentBox = box;
    this.visible = true;
    this.group.attr('visibility', 'visible');
    this.layout(box);
  }

  hide(): void {
    this.visible = false;
    this.currentBox = null;
    this.group.attr('visibility', 'hidden');
  }

  updateBox(box: Box): void {
    this.currentBox = box;
    this.layout(box);
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
