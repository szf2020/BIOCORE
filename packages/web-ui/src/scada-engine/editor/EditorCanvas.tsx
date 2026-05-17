'use client';
import React, { useEffect, useRef } from 'react';
import { useEditorStore } from '../services/editor-store';
import { CanvasController } from './canvas-svg';
import { TransformHandles } from './transform-handles';
import { PointerTools } from './pointer-tools';
import type { Box } from './geometry';
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

  return (
    <div ref={containerRef} className="w-full h-full overflow-auto bg-white">
      {!currentView && <div className="p-8 text-center text-muted-foreground">无视图</div>}
    </div>
  );
}
