import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../editor-store';
import type { FuxaView, FuxaWidget } from '../../models/hmi';

function makeView(overrides: Partial<FuxaView> = {}): FuxaView {
  return {
    id: 'v1', name: 'View 1', type: 'svg', svgcontent: '<svg/>',
    width: 800, height: 600, items: {}, schemaVersion: 1,
    ...overrides,
  } as FuxaView;
}

function makeWidget(id = 'w1'): FuxaWidget {
  return { id, type: 'svg-ext-value', property: {} } as FuxaWidget;
}

beforeEach(() => {
  useEditorStore.setState({
    currentView: null,
    isDirty: false,
    history: { past: [], future: [] },
    selection: [],
  } as any, true);
});

describe('editor-store (SP-FX-2)', () => {
  it('openView sets currentView and resets dirty + history', () => {
    const view = makeView();
    useEditorStore.getState().openView(view);
    const s = useEditorStore.getState();
    expect(s.currentView).toEqual(view);
    expect(s.isDirty).toBe(false);
    expect(s.history.past).toEqual([]);
    expect(s.history.future).toEqual([]);
    expect(s.selection).toEqual([]);
  });

  it('closeView resets everything', () => {
    useEditorStore.getState().openView(makeView());
    useEditorStore.getState().closeView();
    const s = useEditorStore.getState();
    expect(s.currentView).toBeNull();
    expect(s.isDirty).toBe(false);
    expect(s.history.past).toEqual([]);
    expect(s.selection).toEqual([]);
  });

  it('addWidget adds, marks dirty, pushes history', () => {
    useEditorStore.getState().openView(makeView());
    const before = useEditorStore.getState().currentView!;
    useEditorStore.getState().addWidget(makeWidget('w1'));
    const s = useEditorStore.getState();
    expect(s.currentView!.items['w1']).toBeDefined();
    expect(s.isDirty).toBe(true);
    expect(s.history.past.length).toBe(1);
    expect(s.history.past[0]).toEqual(before);
  });

  it('updateWidget patches one widget and marks dirty', () => {
    useEditorStore.getState().openView(makeView({ items: { w1: makeWidget('w1') } }));
    useEditorStore.getState().updateWidget('w1', { name: 'new name' } as any);
    const s = useEditorStore.getState();
    expect((s.currentView!.items['w1'] as any).name).toBe('new name');
    expect(s.isDirty).toBe(true);
  });

  it('updateWidget on missing id is a no-op (no dirty bump, no history push)', () => {
    useEditorStore.getState().openView(makeView());
    useEditorStore.getState().updateWidget('does-not-exist', { name: 'x' } as any);
    const s = useEditorStore.getState();
    expect(s.isDirty).toBe(false);
    expect(s.history.past.length).toBe(0);
  });

  it('deleteWidgets removes multiple ids', () => {
    useEditorStore.getState().openView(makeView({
      items: { w1: makeWidget('w1'), w2: makeWidget('w2'), w3: makeWidget('w3') },
    }));
    useEditorStore.getState().deleteWidgets(['w1', 'w3']);
    const s = useEditorStore.getState();
    expect(Object.keys(s.currentView!.items)).toEqual(['w2']);
    expect(s.isDirty).toBe(true);
  });

  it('undo restores the previous view, redo re-applies', () => {
    useEditorStore.getState().openView(makeView());
    useEditorStore.getState().addWidget(makeWidget('w1'));
    expect(Object.keys(useEditorStore.getState().currentView!.items)).toEqual(['w1']);
    useEditorStore.getState().undo();
    expect(Object.keys(useEditorStore.getState().currentView!.items)).toEqual([]);
    useEditorStore.getState().redo();
    expect(Object.keys(useEditorStore.getState().currentView!.items)).toEqual(['w1']);
  });

  it('undo with empty past is a no-op', () => {
    useEditorStore.getState().openView(makeView());
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().currentView).not.toBeNull();
  });

  it('a new edit clears the future stack', () => {
    useEditorStore.getState().openView(makeView());
    useEditorStore.getState().addWidget(makeWidget('w1'));
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().history.future.length).toBe(1);
    useEditorStore.getState().addWidget(makeWidget('w2'));
    expect(useEditorStore.getState().history.future).toEqual([]);
  });

  it('history.past capped at HISTORY_LIMIT (50)', () => {
    useEditorStore.getState().openView(makeView());
    for (let i = 0; i < 60; i++) useEditorStore.getState().addWidget(makeWidget(`w${i}`));
    expect(useEditorStore.getState().history.past.length).toBe(50);
  });

  it('setSelection replaces the array', () => {
    useEditorStore.getState().openView(makeView({ items: { w1: makeWidget('w1'), w2: makeWidget('w2') } }));
    useEditorStore.getState().setSelection(['w1', 'w2']);
    expect(useEditorStore.getState().selection).toEqual(['w1', 'w2']);
  });

  it('setSelection filters out missing ids', () => {
    useEditorStore.getState().openView(makeView({ items: { w1: makeWidget('w1') } }));
    useEditorStore.getState().setSelection(['w1', 'ghost', 'phantom']);
    expect(useEditorStore.getState().selection).toEqual(['w1']);
  });

  it('addToSelection appends without duplicates', () => {
    useEditorStore.getState().openView(makeView({ items: { w1: makeWidget('w1'), w2: makeWidget('w2') } }));
    useEditorStore.getState().setSelection(['w1']);
    useEditorStore.getState().addToSelection('w2');
    useEditorStore.getState().addToSelection('w2');
    expect(useEditorStore.getState().selection).toEqual(['w1', 'w2']);
  });

  it('removeFromSelection drops one id', () => {
    useEditorStore.getState().openView(makeView({ items: { w1: makeWidget('w1'), w2: makeWidget('w2') } }));
    useEditorStore.getState().setSelection(['w1', 'w2']);
    useEditorStore.getState().removeFromSelection('w1');
    expect(useEditorStore.getState().selection).toEqual(['w2']);
  });

  it('clearSelection resets to []', () => {
    useEditorStore.getState().openView(makeView({ items: { w1: makeWidget('w1') } }));
    useEditorStore.getState().setSelection(['w1']);
    useEditorStore.getState().clearSelection();
    expect(useEditorStore.getState().selection).toEqual([]);
  });

  it('markClean flips isDirty=false without changing history', () => {
    useEditorStore.getState().openView(makeView());
    useEditorStore.getState().addWidget(makeWidget('w1'));
    expect(useEditorStore.getState().isDirty).toBe(true);
    useEditorStore.getState().markClean();
    const s = useEditorStore.getState();
    expect(s.isDirty).toBe(false);
    expect(s.history.past.length).toBe(1);
  });

  it('updateWidget when currentView is null is silent no-op', () => {
    expect(() => useEditorStore.getState().updateWidget('w1', { name: 'x' } as any)).not.toThrow();
    expect(useEditorStore.getState().currentView).toBeNull();
  });

  it('addWidget when currentView is null is silent no-op', () => {
    expect(() => useEditorStore.getState().addWidget(makeWidget('w1'))).not.toThrow();
    expect(useEditorStore.getState().currentView).toBeNull();
  });
});
