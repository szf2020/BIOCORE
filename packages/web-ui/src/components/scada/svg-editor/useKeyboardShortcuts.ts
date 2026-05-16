'use client';
import { useEffect } from 'react';
import { useEditorStore } from './useEditorStore';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const store = useEditorStore.getState();
      const meta = e.ctrlKey || e.metaKey;

      if (meta && (e.key === 'a' || e.key === 'A') && !e.shiftKey) {
        e.preventDefault();
        store.selectAll();
        return;
      }
      if (meta && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        store.redo();
        return;
      }
      if (meta && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        store.undo();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        store.clearSelection();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        store.deleteSelected();
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
