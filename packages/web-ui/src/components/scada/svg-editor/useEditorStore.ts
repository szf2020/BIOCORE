// packages/web-ui/src/components/scada/svg-editor/useEditorStore.ts
import { create } from 'zustand';
import type { SvgViewJson, SvgWidgetItem } from '@/widgets/svg/types';
import type {
  EditorGesture,
  ResizeHandleId,
  ResizeModifiers,
  RotateModifiers,
  SelectMode,
} from './types';
import { resizeRect, rotateAroundCenter, snapToGrid } from './transform-math';

const HISTORY_CAP = 50;
const DEFAULT_GRID_SIZE = 10;

export function createEmptyView(): SvgViewJson {
  return { width: 800, height: 600, items: [] };
}

export interface EditorStore {
  view: SvgViewJson;
  selectedIds: Set<string>;
  history: SvgViewJson[];
  future: SvgViewJson[];
  gridSnap: boolean;
  gridSize: number;
  previewAnimations: boolean;
  gesture: EditorGesture | null;

  select(ids: string[], mode: SelectMode): void;
  selectAll(): void;
  clearSelection(): void;

  beginGesture(g: EditorGesture): void;
  endGesture(): void;
  cancelGesture(): void;

  applyMove(dx: number, dy: number): void;
  applyResize(handle: ResizeHandleId, dx: number, dy: number, mods: ResizeModifiers): void;
  applyRotate(pointerCurrent: { x: number; y: number }, mods: RotateModifiers): void;

  addWidget(item: SvgWidgetItem): void;
  deleteSelected(): void;
  setWidget(id: string, patch: Partial<SvgWidgetItem>): void;

  undo(): void;
  redo(): void;

  setGridSnap(enabled: boolean): void;
  setPreviewAnimations(enabled: boolean): void;

  loadView(view: SvgViewJson): void;
  __resetForTests(view: SvgViewJson): void;
}

function cloneView(v: SvgViewJson): SvgViewJson {
  return JSON.parse(JSON.stringify(v));
}

function pushHistory(history: SvgViewJson[], snapshot: SvgViewJson): SvgViewJson[] {
  const next = [...history, snapshot];
  if (next.length > HISTORY_CAP) next.shift();
  return next;
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  view: createEmptyView(),
  selectedIds: new Set(),
  history: [],
  future: [],
  gridSnap: false,
  gridSize: DEFAULT_GRID_SIZE,
  previewAnimations: false,
  gesture: null,

  select(ids, mode) {
    set((state) => {
      if (mode === 'replace') {
        return { selectedIds: new Set(ids) };
      }
      const next = new Set(state.selectedIds);
      for (const id of ids) {
        if (mode === 'toggle') {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        } else {
          next.add(id);
        }
      }
      return { selectedIds: next };
    });
  },

  selectAll() {
    set((state) => ({ selectedIds: new Set(state.view.items.map((i) => i.id)) }));
  },

  clearSelection() {
    set({ selectedIds: new Set() });
  },

  beginGesture(g) {
    const state = get();
    if (g.type !== 'rubberband') {
      set({
        history: pushHistory(state.history, cloneView(state.view)),
        future: [],
        gesture: g,
      });
    } else {
      set({ gesture: g });
    }
  },

  endGesture() {
    const state = get();
    if (!state.gesture) return;
    if (state.gridSnap && state.gesture.type !== 'rubberband') {
      const snapSize = state.gridSize;
      const isResize = state.gesture.type === 'resize';
      const items = state.view.items.map((it) => {
        if (!state.selectedIds.has(it.id)) return it;
        const snapped: typeof it = {
          ...it,
          x: snapToGrid(it.x, snapSize),
          y: snapToGrid(it.y, snapSize),
        };
        if (isResize) {
          snapped.w = snapToGrid(it.w, snapSize);
          snapped.h = snapToGrid(it.h, snapSize);
        }
        return snapped;
      });
      set({ view: { ...state.view, items }, gesture: null });
    } else {
      set({ gesture: null });
    }
  },

  cancelGesture() {
    const state = get();
    if (!state.gesture) return;
    if (state.gesture.type === 'rubberband') {
      set({ gesture: null });
      return;
    }
    const startBboxes = state.gesture.startBboxes;
    const startRotations = state.gesture.startRotations;
    const items = state.view.items.map((it) => {
      const start = startBboxes[it.id];
      if (!start) return it;
      const startRot = startRotations[it.id];
      return {
        ...it,
        x: start.x,
        y: start.y,
        w: start.w,
        h: start.h,
        rotation: startRot ?? it.rotation,
      };
    });
    const history = state.history.slice(0, -1);
    set({ view: { ...state.view, items }, gesture: null, history });
  },

  applyMove(dx, dy) {
    const state = get();
    if (!state.gesture) return;
    const items = state.view.items.map((it) => {
      const start = state.gesture!.startBboxes[it.id];
      if (!start) return it;
      return { ...it, x: start.x + dx, y: start.y + dy };
    });
    set({ view: { ...state.view, items } });
  },

  applyResize(handle, dx, dy, mods) {
    const state = get();
    if (!state.gesture) return;
    const items = state.view.items.map((it) => {
      const start = state.gesture!.startBboxes[it.id];
      if (!start) return it;
      const next = resizeRect(start, handle, dx, dy, mods);
      return { ...it, x: next.x, y: next.y, w: next.w, h: next.h };
    });
    set({ view: { ...state.view, items } });
  },

  applyRotate(pointerCurrent, mods) {
    const state = get();
    if (!state.gesture) return;
    const items = state.view.items.map((it) => {
      const start = state.gesture!.startBboxes[it.id];
      if (!start) return it;
      const startRot = state.gesture!.startRotations[it.id] ?? 0;
      const newRot = rotateAroundCenter(start, startRot, state.gesture!.startPoint, pointerCurrent, mods);
      return { ...it, rotation: newRot };
    });
    set({ view: { ...state.view, items } });
  },

  addWidget(item) {
    set((state) => ({
      history: pushHistory(state.history, cloneView(state.view)),
      future: [],
      view: { ...state.view, items: [...state.view.items, item] },
    }));
  },

  deleteSelected() {
    set((state) => {
      const items = state.view.items.filter((it) => !state.selectedIds.has(it.id));
      return {
        history: pushHistory(state.history, cloneView(state.view)),
        future: [],
        view: { ...state.view, items },
        selectedIds: new Set(),
      };
    });
  },

  setWidget(id, patch) {
    set((state) => {
      const items = state.view.items.map((it) => (it.id === id ? { ...it, ...patch } : it));
      return {
        history: pushHistory(state.history, cloneView(state.view)),
        future: [],
        view: { ...state.view, items },
      };
    });
  },

  undo() {
    set((state) => {
      if (state.history.length === 0) return state;
      const last = state.history[state.history.length - 1];
      return {
        history: state.history.slice(0, -1),
        future: [...state.future, cloneView(state.view)],
        view: last,
      };
    });
  },

  redo() {
    set((state) => {
      if (state.future.length === 0) return state;
      const next = state.future[state.future.length - 1];
      return {
        future: state.future.slice(0, -1),
        history: pushHistory(state.history, cloneView(state.view)),
        view: next,
      };
    });
  },

  setGridSnap(enabled) {
    set({ gridSnap: enabled });
  },

  setPreviewAnimations(enabled) {
    set({ previewAnimations: enabled });
  },

  loadView(view) {
    set({
      view: cloneView(view),
      selectedIds: new Set(),
      history: [],
      future: [],
      gesture: null,
    });
  },

  __resetForTests(view) {
    set({
      view: cloneView(view),
      selectedIds: new Set(),
      history: [],
      future: [],
      gridSnap: false,
      gridSize: DEFAULT_GRID_SIZE,
      previewAnimations: false,
      gesture: null,
    });
  },
}));
