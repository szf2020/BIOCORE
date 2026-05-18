// SP-FX-4: top toolbar — 4 commands + global keyboard shortcuts (Cmd+S/Z/Shift+Z/Y).
// SP-FX-48.8: + 视图属性 button → opens ViewPropertyDialog for bg color / size edits.

import React, { useEffect, useCallback, useState } from 'react';
import { produce } from 'immer';
import { useEditorStore } from '../../services/editor-store';
import { executeSave } from './commands';
import { ViewPropertyDialog } from '../../dialogs/ViewPropertyDialog';
import { useLocale } from '@/i18n/useLocale';

export interface ToolbarProps { viewId: string; }

export function Toolbar({ viewId }: ToolbarProps): JSX.Element {
  const { t } = useLocale();
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const canUndo = useEditorStore((s) => s.history.past.length > 0);
  const canRedo = useEditorStore((s) => s.history.future.length > 0);
  const currentView = useEditorStore((s) => s.currentView);
  const [propsOpen, setPropsOpen] = useState(false);

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
        {t('toolbar.save')}
      </button>
      <button
        data-cmd="undo"
        onClick={onUndo}
        disabled={!canUndo}
        className="px-3 py-1 text-sm rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 disabled:opacity-40"
      >
        {t('toolbar.undo')}
      </button>
      <button
        data-cmd="redo"
        onClick={onRedo}
        disabled={!canRedo}
        className="px-3 py-1 text-sm rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 disabled:opacity-40"
      >
        {t('toolbar.redo')}
      </button>
      <button
        data-cmd="grid"
        data-active={String(snapEnabled)}
        onClick={onToggleGrid}
        className={`px-3 py-1 text-sm rounded text-zinc-100 ${snapEnabled ? 'bg-emerald-700' : 'bg-zinc-800 hover:bg-zinc-700'}`}
      >
        {t('toolbar.grid')}
      </button>
      <button
        data-cmd="view-props"
        onClick={() => setPropsOpen(true)}
        disabled={!currentView}
        className="px-3 py-1 text-sm rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 disabled:opacity-40"
      >
        视图属性
      </button>
      {currentView && (
        <ViewPropertyDialog
          open={propsOpen}
          view={currentView as any}
          onCancel={() => setPropsOpen(false)}
          onSave={(patch) => {
            useEditorStore.setState((s) => {
              if (!s.currentView) return s;
              return {
                ...s,
                currentView: produce(s.currentView, (draft) => {
                  if (patch.name !== undefined) (draft as any).name = patch.name;
                  if (patch.width !== undefined) (draft as any).width = patch.width;
                  if (patch.height !== undefined) (draft as any).height = patch.height;
                  if (patch.background_color !== undefined) (draft as any).background_color = patch.background_color;
                }),
                isDirty: true,
              } as any;
            });
            setPropsOpen(false);
          }}
        />
      )}
    </header>
  );
}
