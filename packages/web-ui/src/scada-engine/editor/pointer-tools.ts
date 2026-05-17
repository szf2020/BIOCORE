// SP-FX-3a: framework-agnostic pointer state machine for the editor canvas.
// Owns the mousedown/move/up listeners on the SVG root. Drives canvas DOM
// updates during drag (60fps) and only fires onWidgetTransformed on mouseup
// (single history entry per drag).

import type { CanvasController } from './canvas-svg';
import type { TransformHandles } from './transform-handles';
import { clientToSvg, applyHandleDrag, snap, computeBbox, intersectsBox, applyRotate, type HandleId, type Box, type Point } from './geometry';
import { useEditorStore } from '../services/editor-store';

export type PointerState =
  | { kind: 'idle' }
  | { kind: 'drag-body'; widgetIds: string[]; startPt: Point; startBoxes: Map<string, Box> }
  | { kind: 'drag-handle'; widgetId: string; handle: HandleId; startPt: Point; startBox: Box }
  | { kind: 'box-select'; startPt: Point; currentPt: Point; shiftKey: boolean }
  | { kind: 'drag-rotate'; widgetId: string; startPt: Point; pivot: Point; startBox: Box; startRotate: number };

export interface PointerToolsCallbacks {
  getWidgetAt: (pt: Point) => { id: string; box: Box } | null;
  onWidgetTransformed: (id: string, newBox: Box) => void;
  onSelect: (id: string | null, additive: boolean) => void;
  getSnapEnabled: () => boolean;
  getSelectedIds: () => string[];
  getWidgetBoxes: (ids: string[]) => Map<string, Box>;
  getAllWidgetBoxes: () => Map<string, Box>;
  onBoxSelect: (idsInBox: string[], additive: boolean) => void;
  onWidgetTransformedBatch: (entries: { id: string; newBox: Box }[]) => void;
  onDragVisualUpdate: (box: Box | null) => void;
  onBoxSelectMove: (rect: Box | null) => void;
  getCurrentRotate: (id: string) => number | undefined;
  onRotated: (id: string, rotate: number) => void;
  onRotateMove: (deg: number | null, pivot: Point | null) => void;
}

const CLICK_DRAG_THRESHOLD = 3;

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
      if (!widgetHit) return;
      if (handle === 'rotate') {
        const pivot: Point = { x: widgetHit.box.x + widgetHit.box.w / 2, y: widgetHit.box.y + widgetHit.box.h / 2 };
        const startRotate = this.cb.getCurrentRotate(widgetHit.id) ?? 0;
        this.state = { kind: 'drag-rotate', widgetId: widgetHit.id, startPt: pt, pivot, startBox: widgetHit.box, startRotate };
      } else {
        this.state = { kind: 'drag-handle', widgetId: widgetHit.id, handle, startPt: pt, startBox: widgetHit.box };
      }
      return;
    }

    const widgetHit = this.cb.getWidgetAt(pt);
    if (widgetHit) {
      if (e.shiftKey) {
        this.cb.onSelect(widgetHit.id, true);
        return;
      }
      const selected = this.cb.getSelectedIds();
      if (selected.includes(widgetHit.id) && selected.length >= 2) {
        const startBoxes = this.cb.getWidgetBoxes(selected);
        this.state = { kind: 'drag-body', widgetIds: selected, startPt: pt, startBoxes };
      } else {
        this.cb.onSelect(widgetHit.id, false);
        const startBoxes = new Map<string, Box>([[widgetHit.id, widgetHit.box]]);
        this.state = { kind: 'drag-body', widgetIds: [widgetHit.id], startPt: pt, startBoxes };
      }
      return;
    }

    this.state = { kind: 'box-select', startPt: pt, currentPt: pt, shiftKey: e.shiftKey };
  }

  handleMouseMove(e: MouseEvent): void {
    if (this.destroyed) return;
    if (this.state.kind === 'idle') return;
    const pt = this.clientPt(e);

    if (this.state.kind === 'drag-rotate') {
      const snapStep = e.shiftKey ? 15 : 0;
      const deg = applyRotate(this.state.pivot, this.state.startPt, pt, this.state.startRotate, snapStep);
      this.canvas.applyRotate(this.state.widgetId, deg, this.state.pivot);
      this.cb.onRotateMove(deg, this.state.pivot);
      return;
    }

    if (this.state.kind === 'box-select') {
      this.state.currentPt = pt;
      const rect: Box = {
        x: Math.min(this.state.startPt.x, pt.x),
        y: Math.min(this.state.startPt.y, pt.y),
        w: Math.abs(pt.x - this.state.startPt.x),
        h: Math.abs(pt.y - this.state.startPt.y),
      };
      this.cb.onBoxSelectMove(rect);
      return;
    }

    const dx = pt.x - this.state.startPt.x;
    const dy = pt.y - this.state.startPt.y;
    const gridSize = useEditorStore.getState().gridSize;
    const snapOn = this.cb.getSnapEnabled();

    if (this.state.kind === 'drag-handle') {
      let newBox = applyHandleDrag(this.state.startBox, this.state.handle, dx, dy);
      if (snapOn) newBox = snap(newBox, gridSize);
      this.canvas.upsertWidget({ id: this.state.widgetId, type: 'svg-ext-value' as any, property: {} as any, x: newBox.x, y: newBox.y, w: newBox.w, h: newBox.h });
      this.handles.updateBox(newBox);
      this.cb.onDragVisualUpdate(newBox);
      return;
    }

    // drag-body (single or multi)
    const newBoxes: { id: string; newBox: Box }[] = [];
    for (const id of this.state.widgetIds) {
      const sb = this.state.startBoxes.get(id);
      if (!sb) continue;
      let nb: Box = { x: sb.x + dx, y: sb.y + dy, w: sb.w, h: sb.h };
      if (snapOn) nb = snap(nb, gridSize);
      newBoxes.push({ id, newBox: nb });
      this.canvas.upsertWidget({ id, type: 'svg-ext-value' as any, property: {} as any, x: nb.x, y: nb.y, w: nb.w, h: nb.h });
    }
    if (newBoxes.length === 0) return;
    if (newBoxes.length === 1) {
      this.handles.updateBox(newBoxes[0].newBox);
      this.cb.onDragVisualUpdate(newBoxes[0].newBox);
    } else {
      const bbox = computeBbox(newBoxes.map((e) => e.newBox));
      this.handles.updateBox(bbox);
      this.cb.onDragVisualUpdate(bbox);
    }
  }

  handleMouseUp(e: MouseEvent): void {
    if (this.destroyed) return;
    if (this.state.kind === 'idle') return;
    const pt = this.clientPt(e);

    if (this.state.kind === 'drag-rotate') {
      const snapStep = e.shiftKey ? 15 : 0;
      const deg = applyRotate(this.state.pivot, this.state.startPt, pt, this.state.startRotate, snapStep);
      if (deg !== this.state.startRotate) this.cb.onRotated(this.state.widgetId, deg);
      this.state = { kind: 'idle' };
      this.cb.onRotateMove(null, null);
      return;
    }

    if (this.state.kind === 'box-select') {
      const distance = Math.max(Math.abs(pt.x - this.state.startPt.x), Math.abs(pt.y - this.state.startPt.y));
      if (distance < CLICK_DRAG_THRESHOLD) {
        this.cb.onSelect(null, this.state.shiftKey);
      } else {
        const finalBox: Box = {
          x: Math.min(this.state.startPt.x, pt.x),
          y: Math.min(this.state.startPt.y, pt.y),
          w: Math.abs(pt.x - this.state.startPt.x),
          h: Math.abs(pt.y - this.state.startPt.y),
        };
        const allBoxes = this.cb.getAllWidgetBoxes();
        const idsInBox: string[] = [];
        allBoxes.forEach((box, id) => {
          if (intersectsBox(finalBox, box)) idsInBox.push(id);
        });
        this.cb.onBoxSelect(idsInBox, this.state.shiftKey);
      }
      this.state = { kind: 'idle' };
      this.cb.onBoxSelectMove(null);
      return;
    }

    const dx = pt.x - this.state.startPt.x;
    const dy = pt.y - this.state.startPt.y;
    const gridSize = useEditorStore.getState().gridSize;
    const snapOn = this.cb.getSnapEnabled();

    if (this.state.kind === 'drag-handle') {
      let newBox = applyHandleDrag(this.state.startBox, this.state.handle, dx, dy);
      if (snapOn) newBox = snap(newBox, gridSize);
      this.cb.onWidgetTransformed(this.state.widgetId, newBox);
      this.state = { kind: 'idle' };
      this.cb.onDragVisualUpdate(null);
      return;
    }

    if (dx === 0 && dy === 0) {
      this.state = { kind: 'idle' };
      this.cb.onDragVisualUpdate(null);
      return;
    }

    const newBoxes: { id: string; newBox: Box }[] = [];
    for (const id of this.state.widgetIds) {
      const sb = this.state.startBoxes.get(id);
      if (!sb) continue;
      let nb: Box = { x: sb.x + dx, y: sb.y + dy, w: sb.w, h: sb.h };
      if (snapOn) nb = snap(nb, gridSize);
      newBoxes.push({ id, newBox: nb });
    }
    if (newBoxes.length > 0) this.cb.onWidgetTransformedBatch(newBoxes);
    this.state = { kind: 'idle' };
    this.cb.onDragVisualUpdate(null);
  }

  cancel(): void {
    if (this.destroyed) return;
    if (this.state.kind === 'idle') return;

    if (this.state.kind === 'drag-handle') {
      const startBox = this.state.startBox;
      const widgetId = this.state.widgetId;
      this.canvas.upsertWidget({ id: widgetId, type: 'svg-ext-value' as any, property: {} as any, x: startBox.x, y: startBox.y, w: startBox.w, h: startBox.h });
      this.handles.updateBox(startBox);
      this.state = { kind: 'idle' };
      this.cb.onDragVisualUpdate(null);
      return;
    }

    if (this.state.kind === 'drag-rotate') {
      this.canvas.applyRotate(this.state.widgetId, this.state.startRotate, this.state.pivot);
      this.state = { kind: 'idle' };
      this.cb.onRotateMove(null, null);
      return;
    }

    if (this.state.kind === 'drag-body') {
      const dragState = this.state;
      dragState.widgetIds.forEach((id) => {
        const sb = dragState.startBoxes.get(id);
        if (!sb) return;
        this.canvas.upsertWidget({ id, type: 'svg-ext-value' as any, property: {} as any, x: sb.x, y: sb.y, w: sb.w, h: sb.h });
      });
      const boxes = Array.from(dragState.startBoxes.values());
      if (boxes.length === 1) this.handles.updateBox(boxes[0]);
      else this.handles.updateBox(computeBbox(boxes));
      this.state = { kind: 'idle' };
      this.cb.onDragVisualUpdate(null);
      return;
    }

    // box-select
    this.state = { kind: 'idle' };
    this.cb.onBoxSelectMove(null);
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
