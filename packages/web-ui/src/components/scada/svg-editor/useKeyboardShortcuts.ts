'use client';
import { useEffect } from 'react';
import { useEditorStore } from './useEditorStore';

const ARROW_STEP = 1;
const ARROW_SHIFT_STEP = 10;

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
        const g = store.gesture;
        if (g && (g.type === 'move' || g.type === 'resize' || g.type === 'rotate')) {
          store.cancelGesture();
        } else {
          store.clearSelection();
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        store.deleteSelected();
        return;
      }

      const isArrow =
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown';
      if (isArrow) {
        e.preventDefault();
        if (store.selectedIds.size === 0) return;
        const step = e.shiftKey ? ARROW_SHIFT_STEP : ARROW_STEP;
        const dx =
          e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy =
          e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const startBboxes: Record<string, { x: number; y: number; w: number; h: number }> = {};
        for (const it of store.view.items) {
          if (store.selectedIds.has(it.id)) {
            startBboxes[it.id] = { x: it.x, y: it.y, w: it.w, h: it.h };
          }
        }
        store.beginGesture({
          type: 'move',
          startPoint: { x: 0, y: 0 },
          startBboxes,
          startRotations: {},
        });
        store.applyMove(dx, dy);
        store.endGesture();
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
