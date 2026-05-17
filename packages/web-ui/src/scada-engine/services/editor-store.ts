// SP-FX-2: editor-state store for the SCADA editor.
// Separate from realtime-store: this owns view + dirty + history + selection.
// Lifecycle: created when editor mounts, reset when editor unmounts or the
// user switches views.
//
// Design note: actions are defined at module scope so they survive
// useEditorStore.setState({...}, true) calls in tests (full-replace wipes
// in-store closures but not module-level functions).

import { create } from 'zustand';
import { produce } from 'immer';
import type { FuxaView, FuxaWidget } from '../models/hmi';

const HISTORY_LIMIT = 50;

// ---------- data shape ----------

export interface EditorData {
  currentView: FuxaView | null;
  isDirty: boolean;
  history: { past: FuxaView[]; future: FuxaView[] };
  selection: string[];
}

// ---------- actions shape ----------

export interface EditorActions {
  openView: (view: FuxaView) => void;
  closeView: () => void;
  addWidget: (widget: FuxaWidget) => void;
  updateWidget: (id: string, patch: Partial<FuxaWidget>) => void;
  deleteWidgets: (ids: string[]) => void;
  undo: () => void;
  redo: () => void;
  setSelection: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  clearSelection: () => void;
  markClean: () => void;
}

export type EditorState = EditorData & EditorActions;

// ---------- helpers ----------

function pushHistory(past: FuxaView[], snapshot: FuxaView): FuxaView[] {
  const next = [...past, snapshot];
  if (next.length > HISTORY_LIMIT) next.shift();
  return next;
}

// ---------- raw data store ----------

const _store = create<EditorData>(() => ({
  currentView: null,
  isDirty: false,
  history: { past: [], future: [] },
  selection: [],
}));

// ---------- module-level actions (survive setState replace) ----------

const actions: EditorActions = {
  openView: (view) => _store.setState({
    currentView: view,
    isDirty: false,
    history: { past: [], future: [] },
    selection: [],
  }),

  closeView: () => _store.setState({
    currentView: null,
    isDirty: false,
    history: { past: [], future: [] },
    selection: [],
  }),

  addWidget: (widget) => {
    const { currentView } = _store.getState();
    if (!currentView) return;
    _store.setState((s) => ({
      history: { past: pushHistory(s.history.past, s.currentView!), future: [] },
      currentView: produce(currentView, (draft) => { draft.items[widget.id] = widget; }),
      isDirty: true,
    }));
  },

  updateWidget: (id, patch) => {
    const { currentView } = _store.getState();
    if (!currentView) return;
    if (!currentView.items[id]) return;
    _store.setState((s) => ({
      history: { past: pushHistory(s.history.past, s.currentView!), future: [] },
      currentView: produce(currentView, (draft) => { Object.assign(draft.items[id], patch); }),
      isDirty: true,
    }));
  },

  deleteWidgets: (ids) => {
    const { currentView } = _store.getState();
    if (!currentView) return;
    _store.setState((s) => ({
      history: { past: pushHistory(s.history.past, s.currentView!), future: [] },
      currentView: produce(currentView, (draft) => { for (const id of ids) delete draft.items[id]; }),
      isDirty: true,
      selection: s.selection.filter((id) => !ids.includes(id)),
    }));
  },

  undo: () => {
    const { history, currentView } = _store.getState();
    if (history.past.length === 0 || !currentView) return;
    const prev = history.past[history.past.length - 1];
    _store.setState({
      currentView: prev,
      history: { past: history.past.slice(0, -1), future: [...history.future, currentView] },
      isDirty: true,
    });
  },

  redo: () => {
    const { history, currentView } = _store.getState();
    if (history.future.length === 0 || !currentView) return;
    const next = history.future[history.future.length - 1];
    _store.setState({
      currentView: next,
      history: { past: [...history.past, currentView], future: history.future.slice(0, -1) },
      isDirty: true,
    });
  },

  setSelection: (ids) => {
    const { currentView } = _store.getState();
    const valid = currentView ? ids.filter((id) => id in currentView.items) : [];
    _store.setState({ selection: valid });
  },

  addToSelection: (id) => {
    const { currentView, selection } = _store.getState();
    if (!currentView || !(id in currentView.items)) return;
    if (selection.includes(id)) return;
    _store.setState({ selection: [...selection, id] });
  },

  removeFromSelection: (id) => {
    _store.setState((s) => ({ selection: s.selection.filter((x) => x !== id) }));
  },

  clearSelection: () => _store.setState({ selection: [] }),
  markClean: () => _store.setState({ isDirty: false }),
};

// ---------- public store (data + actions merged) ----------
// getState() always returns live data merged with stable action refs.
// setState() delegates to _store so tests can reset data in isolation.

export const useEditorStore = {
  // hook usage (React components)
  ..._store,
  // zustand store API surface expected by tests
  getState: (): EditorState => ({ ..._store.getState(), ...actions }),
  setState: (
    partial: Partial<EditorData> | ((s: EditorData) => Partial<EditorData>),
    replace?: boolean,
  ) => (_store.setState as any)(partial, replace),
  subscribe: _store.subscribe.bind(_store),
} as unknown as typeof _store & { getState: () => EditorState };
