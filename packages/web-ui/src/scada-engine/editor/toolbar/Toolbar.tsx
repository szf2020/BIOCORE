// SP-FX-4: top toolbar — 4 commands + global keyboard shortcuts (Cmd+S/Z/Shift+Z/Y).

import React, { useEffect, useCallback } from 'react';
import { useEditorStore } from '../../services/editor-store';
import { executeSave } from './commands';

export interface ToolbarProps { viewId: string; }

export function Toolbar({ viewId }: ToolbarProps): JSX.Element {
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const canUndo = useEditorStore((s) => s.history.past.length > 0);
  const canRedo = useEditorStore((s) => s.history.future.length > 0);

  const runSave = useCallback(async () => {
    const a = useEditorStore.getState();
    const result = await executeSave({
      saveView: a.saveView, undo: a.undo, redo: a.redo, toggleGrid: a.toggleGrid,
    }, viewId);
    if (result.ok) console.log('[toolbar] save ok');
    else console.warn('[toolbar] save error:', result.error);
  }, [viewId]);

  const onUndo = useCallback(() => { useEditorStore.getState().undo(); }, []);
  const onRedo = useCallback(() => { useEditorStore.getState().redo(); }, []);
  const onToggleGrid = useCallback(() => { useEditorStore.getState().toggleGrid(); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = document.activeElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === 's') {
        e.preventDefault();
        void runSave();
      } else if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        onUndo();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        onRedo();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [runSave, onUndo, onRedo]);

  return (
    <header
      data-panel="toolbar"
      className="h-12 flex items-center gap-2 px-3 border-b border-zinc-700 bg-zinc-900"
    >
      <button
        data-cmd="save"
        onClick={runSave}
        className="px-3 py-1 text-sm rounded bg-blue-600 hover:bg-blue-500 text-white"
      >
        保存
      </button>
      <button
        data-cmd="undo"
        onClick={onUndo}
        disabled={!canUndo}
        className="px-3 py-1 text-sm rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 disabled:opacity-40"
      >
        撤销
      </button>
      <button
        data-cmd="redo"
        onClick={onRedo}
        disabled={!canRedo}
        className="px-3 py-1 text-sm rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 disabled:opacity-40"
      >
        重做
      </button>
      <button
        data-cmd="grid"
        data-active={String(snapEnabled)}
        onClick={onToggleGrid}
        className={`px-3 py-1 text-sm rounded text-zinc-100 ${snapEnabled ? 'bg-emerald-700' : 'bg-zinc-800 hover:bg-zinc-700'}`}
      >
        网格
      </button>
    </header>
  );
}
