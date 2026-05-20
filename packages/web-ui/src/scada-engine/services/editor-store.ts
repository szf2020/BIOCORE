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

export type DrawToolKind = 'pencil' | 'path' | 'ellipse-draw' | null;

// SP-FX-48.26: armed-placement state — when set, the next canvas click spawns
// a widget of this kind at the click point. Cleared on ESC, on spawn, or when
// the user clicks another palette icon.
export type ArmedPlacement =
  | { kind: 'basic'; itemId: string }
  | { kind: 'gauge'; widgetType: string }
  | { kind: 'shape'; shapeName: string; bbox: { w: number; h: number } }
  | null;

export interface EditorData {
  currentView: FuxaView | null;
  // SP-FX-FF.35: optimistic-lock version returned by GET /api/v1/fuxa-views/:id,
  // sent back as If-Match on PUT save. Null until openView gets one.
  viewVersion: number | null;
  isDirty: boolean;
  history: { past: FuxaView[]; future: FuxaView[] };
  selection: string[];
  snapEnabled: boolean;
  gridSize: number;
  drawTool: DrawToolKind;
  drawPoints: number[];
  armedPlacement: ArmedPlacement;
}

// ---------- actions shape ----------

export interface EditorActions {
  openView: (view: FuxaView, version?: number) => void;
  setViewVersion: (v: number | null) => void;
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
  saveView: (viewId: string) => Promise<void>;
  toggleGrid: () => void;
  setDrawTool: (tool: DrawToolKind) => void;
  appendDrawPoint: (x: number, y: number) => void;
  resetDrawPoints: () => void;
  cancelDraw: () => void;
  setArmedPlacement: (a: ArmedPlacement) => void;
  clearArmedPlacement: () => void;
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
  viewVersion: null,
  isDirty: false,
  history: { past: [], future: [] },
  selection: [],
  snapEnabled: true,
  gridSize: 10,
  drawTool: null,
  drawPoints: [],
  armedPlacement: null,
}));

// ---------- module-level actions (survive setState replace) ----------

const actions: EditorActions = {
  openView: (view, version) => _store.setState((s) => ({
    currentView: view,
    viewVersion: version ?? null,
    isDirty: false,
    history: { past: [], future: [] },
    selection: [],
    snapEnabled: s.snapEnabled,
    gridSize: s.gridSize,
    drawTool: null,
    drawPoints: [],
    armedPlacement: null,
  })),

  setViewVersion: (v) => _store.setState({ viewVersion: v }),

  closeView: () => _store.setState((s) => ({
    currentView: null,
    viewVersion: null,
    isDirty: false,
    history: { past: [], future: [] },
    selection: [],
    snapEnabled: s.snapEnabled,
    gridSize: s.gridSize,
    drawTool: null,
    drawPoints: [],
    armedPlacement: null,
  })),

  addWidget: (widget) => {
    const { currentView } = _store.getState();
    if (!currentView) return;
    _store.setState((s) => ({
      history: { past: pushHistory(s.history.past, s.currentView!), future: [] },
      currentView: produce(currentView, (draft) => { draft.items[widget.id] = widget; }),
      isDirty: true,
      selection: [widget.id],
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
      currentView: produce(currentView, (draft) => {
        const target = draft.items[id] as Record<string, unknown>;
        for (const k of Object.keys(patch)) {
          const v = (patch as Record<string, unknown>)[k];
          if (v === undefined) delete target[k];
          else target[k] = v;
        }
      }),
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

  saveView: async (viewId) => {
    // SP-FX-FF.35: server expects UpdateBodySchema {name, type, payload, width,
    // height, ...} + If-Match header with optimistic-lock version.
    const { currentView, viewVersion } = _store.getState();
    if (!currentView) throw new Error('saveView: no currentView');
    const v = currentView as unknown as Record<string, unknown>;
    const body = {
      name: v.name as string,
      type: (v.type as string) ?? 'svg',
      payload: currentView,
      width: (v.width as number) ?? 1200,
      height: (v.height as number) ?? 800,
    };
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (typeof viewVersion === 'number') headers['If-Match'] = String(viewVersion);
    const r = await fetch(`/api/v1/fuxa-views/${viewId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw new Error(`save failed: ${r.status} ${text}`);
    }
    // Server returns updated row including new version.
    const data = await r.json().catch(() => null);
    const newVersion = data?.data?.version ?? data?.version;
    _store.setState({
      isDirty: false,
      ...(typeof newVersion === 'number' ? { viewVersion: newVersion } : {}),
    });
  },

  toggleGrid: () => {
    _store.setState((s) => ({ snapEnabled: !s.snapEnabled }));
  },

  setDrawTool: (tool) => {
    _store.setState({ drawTool: tool, drawPoints: [] });
  },

  appendDrawPoint: (x, y) => {
    _store.setState((s) => ({ drawPoints: [...s.drawPoints, x, y] }));
  },

  resetDrawPoints: () => {
    _store.setState({ drawPoints: [] });
  },

  cancelDraw: () => {
    _store.setState({ drawTool: null, drawPoints: [] });
  },

  setArmedPlacement: (a) => {
    // Arming a placement clears any active draw tool (mutually exclusive)
    _store.setState({ armedPlacement: a, drawTool: null, drawPoints: [] });
  },

  clearArmedPlacement: () => {
    _store.setState({ armedPlacement: null });
  },
};

// ---------- public store (data + actions merged) ----------
// getState() returns data + stable action refs. setState/subscribe forward
// to the underlying data store so tests can reset state via {...EditorData}.
//
// _stateProxy is a persistent object whose action fields can be vi.spyOn'd
// in tests. Data fields are defined as dynamic getters so they always reflect
// the current _store state without caching (preserves immutability of values).

const _DATA_KEYS: ReadonlyArray<keyof EditorData> = [
  'currentView', 'viewVersion', 'isDirty', 'history', 'selection', 'snapEnabled', 'gridSize',
  'drawTool', 'drawPoints', 'armedPlacement',
];

const _stateProxy = { ...actions } as EditorState;
for (const key of _DATA_KEYS) {
  Object.defineProperty(_stateProxy, key, {
    get() { return _store.getState()[key]; },
    configurable: true,
    enumerable: true,
  });
}

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
    getState: (): EditorState => _stateProxy,
    setState: (
      partial: Partial<EditorData> | ((s: EditorData) => Partial<EditorData>),
      replace?: boolean,
    ): void => { (_store.setState as any)(partial, replace); },
    subscribe: _store.subscribe.bind(_store),
  },
) as any;
