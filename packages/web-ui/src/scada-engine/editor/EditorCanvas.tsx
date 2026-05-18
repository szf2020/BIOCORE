'use client';
import React, { useEffect, useRef } from 'react';
import { useEditorStore } from '../services/editor-store';
import { CanvasController } from './canvas-svg';
import { TransformHandles, SnapGuides, RotateTooltip } from './transform-handles';
import { PointerTools } from './pointer-tools';
import { snapPoint, computeBbox, clientToSvg, type Box } from './geometry';
import { makeWidget, makeShapeWidget, makeGaugeWidget } from './palette/palette-items';
import type { FuxaWidget } from '../models';

interface Refs {
  canvas: CanvasController;
  handles: TransformHandles;
  pointer: PointerTools;
  snapGuides: SnapGuides;
  rubberBand: SVGRectElement;
  rotateTooltip: RotateTooltip;
}

function getWidgetGeom(w: FuxaWidget): Box | null {
  if (typeof (w as any).x !== 'number') return null;
  return { x: (w as any).x, y: (w as any).y, w: (w as any).w, h: (w as any).h };
}

export function EditorCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const refs = useRef<Refs | null>(null);
  const nudgeStateRef = useRef<{ lastKey: string | null }>({ lastKey: null });
  const currentView = useEditorStore((s) => s.currentView);
  const selection = useEditorStore((s) => s.selection);
  const items = useEditorStore((s) => s.currentView?.items);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const gridSize = useEditorStore((s) => s.gridSize);

  // (a) Lifecycle: mount/unmount on currentView.id change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!containerRef.current || !currentView) return;
    const canvas = new CanvasController(containerRef.current, {
      width: currentView.width,
      height: currentView.height,
    });
    const handles = new TransformHandles(canvas.overlayLayer);
    const snapGuides = new SnapGuides(canvas.overlayLayer);
    const rotateTooltip = new RotateTooltip(canvas.overlayLayer);
    const rubberBand = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rubberBand.setAttribute('data-overlay', 'rubber-band');
    rubberBand.setAttribute('visibility', 'hidden');
    rubberBand.setAttribute('fill', 'rgba(59,130,246,0.1)');
    rubberBand.setAttribute('stroke', '#3b82f6');
    rubberBand.setAttribute('stroke-dasharray', '4 2');
    rubberBand.setAttribute('pointer-events', 'none');
    (canvas.overlayLayer.node as SVGGElement).appendChild(rubberBand);

    const pointer = new PointerTools(canvas, handles, {
      getWidgetAt: (pt) => {
        const view = useEditorStore.getState().currentView;
        if (!view) return null;
        const ids = Object.keys(view.items).reverse();
        for (const id of ids) {
          const geom = getWidgetGeom(view.items[id]);
          if (!geom) continue;
          if (pt.x >= geom.x && pt.x <= geom.x + geom.w && pt.y >= geom.y && pt.y <= geom.y + geom.h) {
            return { id, box: geom };
          }
        }
        return null;
      },
      onWidgetTransformed: (id, box) => useEditorStore.getState().updateWidget(id, box as Partial<FuxaWidget>),
      onSelect: (id, additive) => {
        const store = useEditorStore.getState();
        if (!id) {
          if (!additive) store.setSelection([]);
          return;
        }
        if (additive) {
          if (store.selection.includes(id)) store.removeFromSelection(id);
          else store.addToSelection(id);
        } else {
          store.setSelection([id]);
        }
      },
      getSnapEnabled: () => useEditorStore.getState().snapEnabled,
      getSelectedIds: () => useEditorStore.getState().selection,
      getWidgetBoxes: (ids) => {
        const view = useEditorStore.getState().currentView;
        const m = new Map<string, Box>();
        if (!view) return m;
        for (const id of ids) {
          const g = getWidgetGeom(view.items[id]);
          if (g) m.set(id, g);
        }
        return m;
      },
      getAllWidgetBoxes: () => {
        const view = useEditorStore.getState().currentView;
        const m = new Map<string, Box>();
        if (!view) return m;
        for (const id in view.items) {
          const g = getWidgetGeom(view.items[id]);
          if (g) m.set(id, g);
        }
        return m;
      },
      onBoxSelect: (ids, additive) => {
        const store = useEditorStore.getState();
        if (additive) {
          const merged = Array.from(new Set([...store.selection, ...ids]));
          store.setSelection(merged);
        } else {
          store.setSelection(ids);
        }
      },
      onWidgetTransformedBatch: (entries) => {
        if (entries.length === 0) return;
        const store = useEditorStore.getState();
        for (let i = 0; i < entries.length - 1; i++) {
          store.updateWidget(entries[i].id, entries[i].newBox as Partial<FuxaWidget>, { silent: true });
        }
        const last = entries[entries.length - 1];
        store.updateWidget(last.id, last.newBox as Partial<FuxaWidget>);
      },
      onDragVisualUpdate: (box) => {
        if (!refs.current) return;
        const store = useEditorStore.getState();
        if (box && store.snapEnabled && store.currentView) {
          refs.current.snapGuides.show(box, { w: store.currentView.width, h: store.currentView.height });
        } else {
          refs.current.snapGuides.hide();
        }
      },
      onBoxSelectMove: (rect) => {
        if (!refs.current) return;
        const r = refs.current.rubberBand;
        if (!rect) {
          r.setAttribute('visibility', 'hidden');
        } else {
          r.setAttribute('x', String(rect.x));
          r.setAttribute('y', String(rect.y));
          r.setAttribute('width', String(rect.w));
          r.setAttribute('height', String(rect.h));
          r.setAttribute('visibility', 'visible');
        }
      },
      getCurrentRotate: (id) => {
        const view = useEditorStore.getState().currentView;
        return (view?.items[id] as { rotate?: number } | undefined)?.rotate;
      },
      onRotated: (id, deg) => {
        const store = useEditorStore.getState();
        if (deg === 0) store.updateWidget(id, { rotate: undefined } as Partial<FuxaWidget>);
        else store.updateWidget(id, { rotate: deg } as Partial<FuxaWidget>);
      },
      onRotateMove: (deg, pivot) => {
        if (!refs.current) return;
        if (deg === null || pivot === null) refs.current.rotateTooltip.hide();
        else refs.current.rotateTooltip.show(deg, pivot);
      },
      getCurrentRotates: (ids) => {
        const view = useEditorStore.getState().currentView;
        const m = new Map<string, number>();
        if (!view) return m;
        for (const id of ids) {
          const r = (view.items[id] as { rotate?: number } | undefined)?.rotate;
          if (typeof r === 'number') m.set(id, r);
        }
        return m;
      },
      onGroupRotated: (entries) => {
        if (entries.length === 0) return;
        const store = useEditorStore.getState();
        for (let i = 0; i < entries.length - 1; i++) {
          const e = entries[i];
          const patch = {
            x: e.newBox.x, y: e.newBox.y, w: e.newBox.w, h: e.newBox.h,
            rotate: e.newRotate === 0 ? undefined : e.newRotate,
          };
          store.updateWidget(e.id, patch as Partial<FuxaWidget>, { silent: true });
        }
        const last = entries[entries.length - 1];
        const lastPatch = {
          x: last.newBox.x, y: last.newBox.y, w: last.newBox.w, h: last.newBox.h,
          rotate: last.newRotate === 0 ? undefined : last.newRotate,
        };
        store.updateWidget(last.id, lastPatch as Partial<FuxaWidget>);
      },
    });
    refs.current = { canvas, handles, pointer, snapGuides, rubberBand, rotateTooltip };
    canvas.loadView(currentView);
    const store0 = useEditorStore.getState();
    canvas.setGridVisible(store0.snapEnabled ?? true, store0.gridSize ?? 10);
    return () => {
      pointer.destroy();
      snapGuides.destroy();
      rotateTooltip.destroy();
      canvas.destroy();
      refs.current = null;
    };
  }, [currentView?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // (b) DOM sync: re-upsert widgets when items change; remove widgets deleted by undo/redo
  useEffect(() => {
    if (!refs.current || !currentView) return;
    const storeIds = new Set(Object.keys(currentView.items));
    for (const domId of refs.current.canvas.getWidgetIds()) {
      if (!storeIds.has(domId)) refs.current.canvas.removeWidget(domId);
    }
    for (const id in currentView.items) {
      refs.current.canvas.upsertWidget(currentView.items[id]);
    }
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  // (c) Handle sync: show/hide handles when selection or items change
  useEffect(() => {
    if (!refs.current || !currentView) return;
    if (selection.length === 0) { refs.current.handles.hide(); return; }
    if (selection.length === 1) {
      const w = currentView.items[selection[0]];
      const g = w ? getWidgetGeom(w) : null;
      if (g) refs.current.handles.show(g);
      else refs.current.handles.hide();
      return;
    }
    const boxes: Box[] = [];
    for (const id of selection) {
      const w = currentView.items[id];
      const g = w ? getWidgetGeom(w) : null;
      if (g) boxes.push(g);
    }
    if (boxes.length === 0) refs.current.handles.hide();
    else refs.current.handles.showBbox(computeBbox(boxes));
  }, [selection, items]); // eslint-disable-line react-hooks/exhaustive-deps

  // SP-FX-3b.1+3b.2.1: snap-toggle wire + dynamic gridSize.
  useEffect(() => {
    if (!refs.current) return;
    refs.current.canvas.setGridVisible(snapEnabled ?? true, gridSize ?? 10);
  }, [snapEnabled, gridSize]);

  // SP-FX-3b.2.1: extended keyboard handler — Ctrl+A, ESC 3-tier, Arrow nudge coalesce.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement;
      const tag = (ae?.tagName ?? '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (ae as any)?.isContentEditable) return;

      if (e.key === 'Escape') {
        if (refs.current?.pointer.state.kind !== 'idle') {
          refs.current?.pointer.cancel();
          return;
        }
        const sel = useEditorStore.getState().selection;
        if (sel.length > 0) {
          e.preventDefault();
          useEditorStore.getState().setSelection([]);
        }
        return;
      }

      if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        const view = useEditorStore.getState().currentView;
        if (!view) return;
        useEditorStore.getState().setSelection(Object.keys(view.items));
        return;
      }

      if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (refs.current?.pointer.state.kind !== 'idle') return;
        useEditorStore.getState().undo();
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (refs.current?.pointer.state.kind !== 'idle') return;
        useEditorStore.getState().redo();
        return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const state = useEditorStore.getState();
        const ids = state.selection;
        if (ids.length === 0 || !state.currentView) return;
        const gs = state.gridSize ?? 10;
        const step = e.shiftKey ? gs : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const isRepeat = (e.repeat === true) || (nudgeStateRef.current.lastKey === e.key);
        nudgeStateRef.current.lastKey = e.key;
        const survivingIds = ids.filter((id) => {
          const w = state.currentView!.items[id] as any;
          return typeof w?.x === 'number';
        });
        if (survivingIds.length === 0) return;
        for (let i = 0; i < survivingIds.length; i++) {
          const id = survivingIds[i];
          const w = state.currentView!.items[id] as any;
          const next = { x: w.x + dx, y: w.y + dy };
          const final = state.snapEnabled ? snapPoint(next, gs) : next;
          const isLast = i === survivingIds.length - 1;
          state.updateWidget(id, final as Partial<FuxaWidget>, { silent: isRepeat || !isLast });
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
        if (nudgeStateRef.current.lastKey === e.key) nudgeStateRef.current.lastKey = null;
      }
    };
    const onBlur = () => { nudgeStateRef.current.lastKey = null; };
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      data-editor-canvas-host
      className="w-full h-full overflow-auto bg-white"
      onDragOver={(e) => {
        const types = e.dataTransfer.types;
        if (
          types.includes('palette-item') ||
          types.includes('palette-shape') ||
          types.includes('palette-gauge')
        ) {
          e.preventDefault();
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        const host = e.currentTarget as HTMLElement;
        const svg = host.querySelector('svg') as SVGSVGElement | null;
        let ctm: DOMMatrix | null = null;
        try { ctm = svg ? svg.getScreenCTM() : null; } catch { ctm = null; }
        const hostRect = host.getBoundingClientRect();
        const local = ctm
          ? clientToSvg({ x: e.clientX, y: e.clientY }, ctm.inverse())
          : { x: e.clientX - hostRect.left, y: e.clientY - hostRect.top };
        const store = useEditorStore.getState();

        const basicType = e.dataTransfer.getData('palette-item') as 'rect' | 'ellipse' | 'text' | '';
        if (basicType && (['rect', 'ellipse', 'text'] as string[]).includes(basicType)) {
          store.addWidget(makeWidget(basicType, local, store.gridSize));
          return;
        }

        const shapeJson = e.dataTransfer.getData('palette-shape');
        if (shapeJson) {
          try {
            const parsed = JSON.parse(shapeJson) as { id?: unknown; src?: unknown };
            const id = parsed.id;
            const src = parsed.src;
            if (typeof id === 'string' && id && typeof src === 'string' && src) {
              store.addWidget(makeShapeWidget(id, src, local, store.gridSize));
            }
          } catch {
            // malformed JSON; silently ignore
          }
          return;
        }

        // SP-FX-27: batch 2 gauge widgets drag support.
        const gaugeType = e.dataTransfer.getData('palette-gauge');
        if (gaugeType) {
          store.addWidget(makeGaugeWidget(gaugeType, local, store.gridSize));
        }
      }}
    >
      {!currentView && <div className="p-8 text-center text-muted-foreground">无视图</div>}
    </div>
  );
}
