import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';
import { useEditorStore } from '../useEditorStore';
import type { SvgViewJson, SvgWidgetItem } from '@/widgets/svg/types';

function mkItem(id: string): SvgWidgetItem {
  return { id, type: 'svg-rect', x: 0, y: 0, w: 50, h: 50 };
}

function dispatchKey(opts: KeyboardEventInit & { key: string }) {
  const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...opts });
  window.dispatchEvent(ev);
}

beforeEach(() => {
  useEditorStore.getState().__resetForTests({ width: 800, height: 600, items: [mkItem('a'), mkItem('b')] });
});

describe('useKeyboardShortcuts', () => {
  it('Ctrl+A selects all', () => {
    renderHook(() => useKeyboardShortcuts());
    dispatchKey({ key: 'a', ctrlKey: true });
    expect(useEditorStore.getState().selectedIds.size).toBe(2);
  });

  it('Escape clears selection', () => {
    renderHook(() => useKeyboardShortcuts());
    useEditorStore.getState().select(['a'], 'replace');
    dispatchKey({ key: 'Escape' });
    expect(useEditorStore.getState().selectedIds.size).toBe(0);
  });

  it('Delete removes selected widgets', () => {
    renderHook(() => useKeyboardShortcuts());
    useEditorStore.getState().select(['a'], 'replace');
    dispatchKey({ key: 'Delete' });
    expect(useEditorStore.getState().view.items.map(i => i.id)).toEqual(['b']);
  });

  it('Ctrl+Z undoes last commit', () => {
    renderHook(() => useKeyboardShortcuts());
    useEditorStore.getState().select(['a'], 'replace');
    useEditorStore.getState().deleteSelected();
    dispatchKey({ key: 'z', ctrlKey: true });
    expect(useEditorStore.getState().view.items.length).toBe(2);
  });

  it('Ctrl+Shift+Z redoes', () => {
    renderHook(() => useKeyboardShortcuts());
    useEditorStore.getState().select(['a'], 'replace');
    useEditorStore.getState().deleteSelected();
    useEditorStore.getState().undo();
    dispatchKey({ key: 'z', ctrlKey: true, shiftKey: true });
    expect(useEditorStore.getState().view.items.map(i => i.id)).toEqual(['b']);
  });

  describe('arrow-key nudge', () => {
    it('ArrowRight without shift moves selected widgets by +1px x', () => {
      const view: SvgViewJson = {
        width: 800,
        height: 600,
        items: [{ id: 'a', type: 'svg-rect', x: 10, y: 20, w: 50, h: 50 }],
      };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().select(['a'], 'replace');
      renderHook(() => useKeyboardShortcuts());
      dispatchKey({ key: 'ArrowRight' });
      expect(useEditorStore.getState().view.items[0]).toMatchObject({ x: 11, y: 20 });
      expect(useEditorStore.getState().gesture).toBeNull();
    });

    it('Shift+ArrowDown moves selected widgets by +10px y', () => {
      const view: SvgViewJson = {
        width: 800,
        height: 600,
        items: [{ id: 'a', type: 'svg-rect', x: 10, y: 20, w: 50, h: 50 }],
      };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().select(['a'], 'replace');
      renderHook(() => useKeyboardShortcuts());
      dispatchKey({ key: 'ArrowDown', shiftKey: true });
      expect(useEditorStore.getState().view.items[0]).toMatchObject({ x: 10, y: 30 });
    });

    it('arrow key with no selection is a no-op', () => {
      const view: SvgViewJson = {
        width: 800,
        height: 600,
        items: [{ id: 'a', type: 'svg-rect', x: 10, y: 20, w: 50, h: 50 }],
      };
      useEditorStore.getState().__resetForTests(view);
      renderHook(() => useKeyboardShortcuts());
      const before = useEditorStore.getState().view.items[0];
      dispatchKey({ key: 'ArrowLeft' });
      expect(useEditorStore.getState().view.items[0]).toEqual(before);
    });
  });

  describe('escape during gesture', () => {
    it('Escape while a move gesture is active calls cancelGesture (snaps widgets back)', () => {
      const view: SvgViewJson = {
        width: 800,
        height: 600,
        items: [{ id: 'a', type: 'svg-rect', x: 10, y: 20, w: 50, h: 50 }],
      };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().select(['a'], 'replace');
      const startBboxes = { a: { x: 10, y: 20, w: 50, h: 50 } };
      useEditorStore.getState().beginGesture({
        type: 'move',
        startPoint: { x: 0, y: 0 },
        startBboxes,
        startRotations: {},
      });
      useEditorStore.getState().applyMove(40, 50);
      expect(useEditorStore.getState().view.items[0]).toMatchObject({ x: 50, y: 70 });

      renderHook(() => useKeyboardShortcuts());
      dispatchKey({ key: 'Escape' });

      const s = useEditorStore.getState();
      expect(s.gesture).toBeNull();
      expect(s.view.items[0]).toMatchObject({ x: 10, y: 20 });
      expect(s.selectedIds.has('a')).toBe(true);
    });
  });
});
