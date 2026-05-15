import { describe, it, expect } from 'vitest';
import { editorReducer, type EditorState } from '../useEditorState';

function base(): EditorState {
  return {
    items: {
      t1: { id: 't1', type: 'tank', x: 10, y: 20, w: 80, h: 200, props: { color: '#000' } } as any,
    },
    selectedId: null,
    baselineUpdatedAt: '2026-05-15T00:00:00Z',
    dirty: false,
  };
}

describe('editorReducer', () => {
  it('1. add → adds widget, sets dirty=true, auto-selects new id', () => {
    const next = editorReducer(base(), {
      type: 'add',
      widget: { id: 'b1', type: 'button', x: 0, y: 0, w: 50, h: 30, props: {} } as any,
    });
    expect(next.items.b1).toBeDefined();
    expect(next.selectedId).toBe('b1');
    expect(next.dirty).toBe(true);
  });

  it('2. move → updates x/y, preserves other widget fields', () => {
    const next = editorReducer(base(), { type: 'move', id: 't1', x: 100, y: 200 });
    expect(next.items.t1).toMatchObject({ x: 100, y: 200, w: 80, h: 200 });
    expect((next.items.t1 as any).props.color).toBe('#000');
    expect(next.dirty).toBe(true);
  });

  it('3. delete → removes widget, clears selectedId if it pointed at it', () => {
    const start: EditorState = { ...base(), selectedId: 't1' };
    const next = editorReducer(start, { type: 'delete', id: 't1' });
    expect(next.items.t1).toBeUndefined();
    expect(next.selectedId).toBeNull();
    expect(next.dirty).toBe(true);
  });

  it('4. markSaved → clears dirty, updates baselineUpdatedAt', () => {
    const dirty: EditorState = { ...base(), dirty: true };
    const next = editorReducer(dirty, { type: 'markSaved', updated_at: '2026-05-15T12:00:00Z' });
    expect(next.dirty).toBe(false);
    expect(next.baselineUpdatedAt).toBe('2026-05-15T12:00:00Z');
    expect(next.items).toEqual(dirty.items);
  });
});
