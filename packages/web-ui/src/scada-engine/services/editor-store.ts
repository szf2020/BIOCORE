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
import type { FuxaView } from '../models/hmi';
import type { FuxaWidget } from '../models/widget';

// SP-FX-3b.2.1: GRID_SIZE migrated to editorStore.gridSize state. Kept as
// deprecated re-export for SP-FX-3b.1 backward compatibility. New code should
// read useEditorStore.getState().gridSize instead.
/** @deprecated Read useEditorStore.getState().gridSize instead */
export const GRID_SIZE = 10;

const HISTORY_LIMIT = 50;

// ---------- data shape ----------

export interface EditorData {
  currentView: FuxaView | null;
  isDirty: boolean;
  history: { past: FuxaView[]; future: FuxaView[] };
  selection: string[];
  snapEnabled: boolean;
  gridSize: number;
}

// ---------- actions shape ----------

export interface EditorActions {
  openView: (view: FuxaView) => void;
  closeView: () => void;
  addWidget: (widget: FuxaWidget) => void;
  updateWidget: (id: string, patch: Partial<FuxaWidget>, opts?: { silent?: boolean }) => void;
  deleteWidgets: (ids: string[]) => void;
  undo: () => void;
  redo: () => void;
  setSelection: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  clearSelection: () => void;
  markClean: () => void;
  setSnapEnabled: (enabled: boolean) => void;
  setGridSize: (n: number) => void;
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
  snapEnabled: true,
  gridSize: 10,
}));

// ---------- module-level actions (survive setState replace) ----------

const actions: EditorActions = {
  openView: (view) => _store.setState((s) => ({
    currentView: view,
    isDirty: false,
    history: { past: [], future: [] },
    selection: [],
    snapEnabled: s.snapEnabled,
    gridSize: s.gridSize,
  })),

  closeView: () => _store.setState((s) => ({
    currentView: null,
    isDirty: false,
    history: { past: [], future: [] },
    selection: [],
    snapEnabled: s.snapEnabled,
    gridSize: s.gridSize,
  })),

  addWidget: (widget) => {
    const { currentView } = _store.getState();
    if (!currentView) return;
    _store.setState((s) => ({
      history: { past: pushHistory(s.history.past, s.currentView!), future: [] },
      currentView: produce(currentView, (draft) => { draft.items[widget.id] = widget; }),
      isDirty: true,
    }));
  },

  updateWidget: (id, patch, opts) => {
    const { currentView } = _store.getState();
    if (!currentView) return;
    if (!currentView.items[id]) return;
    _store.setState((s) => ({
      history: opts?.silent
        ? s.history
        : { past: pushHistory(s.history.past, s.currentView!), future: [] },
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
  setSnapEnabled: (enabled) => _store.setState({ snapEnabled: enabled }),
  setGridSize: (n) => {
    if (![8, 10, 16, 20].includes(n)) return;
    _store.setState({ gridSize: n });
  },
};

// ---------- public store (data + actions merged) ----------
// getState() returns data + stable action refs. setState/subscribe forward
// to the underlying data store so tests can reset state via {...EditorData}.

interface EditorStoreApi {
  getState: () => EditorState;
  setState: (
    partial: Partial<EditorData> | ((s: EditorData) => Partial<EditorData>),
    replace?: boolean,
  ) => void;
  subscribe: typeof _store.subscribe;
}

export const useEditorStore: EditorStoreApi & {
  // also callable as hook for React consumers selecting a slice
  <T>(selector: (s: EditorState) => T): T;
} = Object.assign(
  function useEditorStoreHook<T>(selector: (s: EditorState) => T): T {
    return _store((d) => selector({ ...d, ...actions }));
  },
  {
    getState: (): EditorState => ({ ..._store.getState(), ...actions }),
    setState: (
      partial: Partial<EditorData> | ((s: EditorData) => Partial<EditorData>),
      replace?: boolean,
    ): void => { (_store.setState as any)(partial, replace); },
    subscribe: _store.subscribe.bind(_store),
  },
) as any;
