// SP-FX-3a: framework-agnostic pointer state machine for the editor canvas.
// Owns the mousedown/move/up listeners on the SVG root. Drives canvas DOM
// updates during drag (60fps) and only fires onWidgetTransformed on mouseup
// (single history entry per drag).

import type { CanvasController } from './canvas-svg';
import type { TransformHandles } from './transform-handles';
import { clientToSvg, applyHandleDrag, type HandleId, type Box, type Point } from './geometry';

export type PointerState =
  | { kind: 'idle' }
  | { kind: 'drag-body'; widgetId: string; startPt: Point; startBox: Box }
  | { kind: 'drag-handle'; widgetId: string; handle: HandleId; startPt: Point; startBox: Box };

export interface PointerToolsCallbacks {
  getWidgetAt: (pt: Point) => { id: string; box: Box } | null;
  onWidgetTransformed: (id: string, newBox: Box) => void;
  onSelect: (id: string | null) => void;
}

export class PointerTools {
  state: PointerState = { kind: 'idle' };
  private destroyed = false;
  private boundDown: (e: MouseEvent) => void;
  private boundMove: (e: MouseEvent) => void;
  private boundUp: (e: MouseEvent) => void;

  constructor(
    private canvas: CanvasController,
    private handles: TransformHandles,
    private cb: PointerToolsCallbacks,
  ) {
    this.boundDown = (e) => this.handleMouseDown(e);
    this.boundMove = (e) => this.handleMouseMove(e);
    this.boundUp = (e) => this.handleMouseUp(e);
    const root = this.canvas.getSvgRoot();
    root.addEventListener('mousedown', this.boundDown);
    root.addEventListener('mousemove', this.boundMove);
    root.addEventListener('mouseup', this.boundUp);
  }

  private clientPt(e: MouseEvent): Point {
    const root = this.canvas.getSvgRoot();
    const ctm = (root as any).getScreenCTM?.();
    if (!ctm || typeof (ctm as any).inverse !== 'function') {
      return { x: e.clientX, y: e.clientY };
    }
    const inverse = (ctm as any).inverse();
    return clientToSvg({ x: e.clientX, y: e.clientY }, inverse);
  }

  handleMouseDown(e: MouseEvent): void {
    if (this.destroyed) return;
    const pt = this.clientPt(e);

    const handle = this.handles.hitTest(pt);
    if (handle) {
      const widgetHit = this.cb.getWidgetAt(pt);
      if (widgetHit) {
        this.state = { kind: 'drag-handle', widgetId: widgetHit.id, handle, startPt: pt, startBox: widgetHit.box };
      }
      return;
    }

    const widgetHit = this.cb.getWidgetAt(pt);
    if (widgetHit) {
      this.cb.onSelect(widgetHit.id);
      this.state = { kind: 'drag-body', widgetId: widgetHit.id, startPt: pt, startBox: widgetHit.box };
    } else {
      this.cb.onSelect(null);
    }
  }

  handleMouseMove(e: MouseEvent): void {
    if (this.destroyed) return;
    if (this.state.kind === 'idle') return;
    const pt = this.clientPt(e);
    const dx = pt.x - this.state.startPt.x;
    const dy = pt.y - this.state.startPt.y;
    const newBox = this.state.kind === 'drag-body'
      ? { x: this.state.startBox.x + dx, y: this.state.startBox.y + dy, w: this.state.startBox.w, h: this.state.startBox.h }
      : applyHandleDrag(this.state.startBox, this.state.handle, dx, dy);
    this.canvas.upsertWidget({ id: this.state.widgetId, type: 'svg-ext-value' as any, property: {} as any, x: newBox.x, y: newBox.y, w: newBox.w, h: newBox.h });
    this.handles.updateBox(newBox);
  }

  handleMouseUp(e: MouseEvent): void {
    if (this.destroyed) return;
    if (this.state.kind === 'idle') return;
    const pt = this.clientPt(e);
    const dx = pt.x - this.state.startPt.x;
    const dy = pt.y - this.state.startPt.y;
    const newBox = this.state.kind === 'drag-body'
      ? { x: this.state.startBox.x + dx, y: this.state.startBox.y + dy, w: this.state.startBox.w, h: this.state.startBox.h }
      : applyHandleDrag(this.state.startBox, this.state.handle, dx, dy);
    this.cb.onWidgetTransformed(this.state.widgetId, newBox);
    this.state = { kind: 'idle' };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const root = this.canvas.getSvgRoot();
    root.removeEventListener('mousedown', this.boundDown);
    root.removeEventListener('mousemove', this.boundMove);
    root.removeEventListener('mouseup', this.boundUp);
    this.state = { kind: 'idle' };
  }
}
