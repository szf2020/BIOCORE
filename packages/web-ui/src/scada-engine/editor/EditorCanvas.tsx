'use client';
import React, { useEffect, useRef } from 'react';
import { useEditorStore, GRID_SIZE } from '../services/editor-store';
import { CanvasController } from './canvas-svg';
import { TransformHandles } from './transform-handles';
import { PointerTools } from './pointer-tools';
import { snapPoint, type Box } from './geometry';
import type { FuxaWidget } from '../models';

interface Refs {
  canvas: CanvasController;
  handles: TransformHandles;
  pointer: PointerTools;
}

function getWidgetGeom(w: FuxaWidget): Box | null {
  if (typeof (w as any).x !== 'number') return null;
  return { x: (w as any).x, y: (w as any).y, w: (w as any).w, h: (w as any).h };
}

export function EditorCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const refs = useRef<Refs | null>(null);
  const currentView = useEditorStore((s) => s.currentView);
  const selection = useEditorStore((s) => s.selection);
  const items = useEditorStore((s) => s.currentView?.items);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);

  // (a) Lifecycle: mount/unmount on currentView.id change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!containerRef.current || !currentView) return;
    const canvas = new CanvasController(containerRef.current, {
      width: currentView.width,
      height: currentView.height,
    });
    const handles = new TransformHandles(canvas.overlayLayer);
    const { updateWidget, setSelection } = useEditorStore.getState();
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
      onWidgetTransformed: (id, box) => updateWidget(id, box as Partial<FuxaWidget>),
      onSelect: (id) => setSelection(id ? [id] : []),
      getSnapEnabled: () => useEditorStore.getState().snapEnabled,
    });
    refs.current = { canvas, handles, pointer };
    canvas.loadView(currentView);
    canvas.setGridVisible(useEditorStore.getState().snapEnabled ?? true, GRID_SIZE);
    return () => {
      pointer.destroy();
      canvas.destroy();
      refs.current = null;
    };
  }, [currentView?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // (b) DOM sync: re-upsert widgets when items change
  useEffect(() => {
    if (!refs.current || !currentView) return;
    for (const id in currentView.items) {
      refs.current.canvas.upsertWidget(currentView.items[id]);
    }
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  // (c) Handle sync: show/hide handles when selection or items change
  useEffect(() => {
    if (!refs.current || !currentView) return;
    const id = selection[0];
    if (!id) { refs.current.handles.hide(); return; }
    const widget = currentView.items[id];
    if (!widget) { refs.current.handles.hide(); return; }
    const geom = getWidgetGeom(widget);
    if (!geom) { refs.current.handles.hide(); return; }
    refs.current.handles.show(geom);
  }, [selection, items]); // eslint-disable-line react-hooks/exhaustive-deps

  // SP-FX-3b.1: snap-toggle wire — repaint grid background when snapEnabled changes.
  useEffect(() => {
    if (!refs.current) return;
    refs.current.canvas.setGridVisible(snapEnabled, GRID_SIZE);
  }, [snapEnabled]);

  // SP-FX-3b.1: global keyboard handler — Escape / Ctrl+Z / Ctrl+Y / Arrow nudge.
  // Skipped when activeElement is INPUT / TEXTAREA / contentEditable.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement;
      const tag = (ae?.tagName ?? '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (ae as any)?.isContentEditable) return;

      if (e.key === 'Escape') {
        refs.current?.pointer.cancel();
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
        const id = state.selection[0];
        if (!id || !state.currentView) return;
        const w = state.currentView.items[id] as any;
        if (typeof w.x !== 'number') return;
        const step = e.shiftKey ? GRID_SIZE : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const next = { x: w.x + dx, y: w.y + dy };
        const final = state.snapEnabled ? snapPoint(next, GRID_SIZE) : next;
        state.updateWidget(id, final as Partial<FuxaWidget>);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full overflow-auto bg-white">
      {!currentView && <div className="p-8 text-center text-muted-foreground">无视图</div>}
    </div>
  );
}
