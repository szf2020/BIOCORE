'use client';
import React, { useEffect } from 'react';
import type { ScadaView } from '@/api/scada';
import { useEditorState } from '@/hooks/useEditorState';
import { WidgetPalette } from './WidgetPalette';
import { EditorCanvas } from './EditorCanvas';
import { PropertyPanel } from './PropertyPanel';
import { SaveBar } from './SaveBar';

export function EditorShell({ view }: { view: ScadaView }) {
  const [state, dispatch] = useEditorState(view);
  const selected = state.selectedId ? state.items[state.selectedId] : null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'Escape') {
        dispatch({ type: 'select', id: null });
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId) {
        dispatch({ type: 'delete', id: state.selectedId });
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state.selectedId, dispatch]);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <SaveBar state={state} viewId={view.view_id} dispatch={dispatch} />
      <div className="flex flex-1 min-h-0">
        <WidgetPalette />
        <div className="flex-1 overflow-auto bg-gray-200">
          <EditorCanvas
            view={view}
            items={state.items}
            selectedId={state.selectedId}
            onSelect={(id) => dispatch({ type: 'select', id })}
            onAdd={(widget) => dispatch({ type: 'add', widget })}
            onMove={(id, x, y) => dispatch({ type: 'move', id, x, y })}
            onResize={(id, w, h) => dispatch({ type: 'resize', id, w, h })}
          />
        </div>
        <PropertyPanel selected={selected ?? null} dispatch={dispatch} />
      </div>
    </div>
  );
}
