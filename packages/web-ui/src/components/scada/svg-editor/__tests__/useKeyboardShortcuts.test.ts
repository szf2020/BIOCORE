import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';
import { useEditorStore } from '../useEditorStore';
import type { SvgWidgetItem } from '@/widgets/svg/types';

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
});
