import { useReducer } from 'react';
import type { WidgetDef, Binding } from '@/widgets';
import type { ScadaView } from '@/api/scada';

export interface EditorState {
  items: Record<string, WidgetDef>;
  selectedId: string | null;
  baselineUpdatedAt: string;
  dirty: boolean;
}

export type EditorAction =
  | { type: 'add'; widget: WidgetDef }
  | { type: 'select'; id: string | null }
  | { type: 'move'; id: string; x: number; y: number }
  | { type: 'resize'; id: string; w: number; h: number }
  | { type: 'updateProps'; id: string; patch: Record<string, any> }
  | { type: 'setBindings'; id: string; bindings: Binding[] }
  | { type: 'delete'; id: string }
  | { type: 'loadFromServer'; view: ScadaView }
  | { type: 'markSaved'; updated_at: string };

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'loadFromServer':
      return {
        items: { ...(action.view.items ?? {}) },
        selectedId: null,
        baselineUpdatedAt: action.view.updated_at,
        dirty: false,
      };
    case 'markSaved':
      return { ...state, baselineUpdatedAt: action.updated_at, dirty: false };
    case 'select':
      return { ...state, selectedId: action.id };
    case 'add':
      return {
        ...state,
        items: { ...state.items, [action.widget.id]: action.widget },
        selectedId: action.widget.id,
        dirty: true,
      };
    case 'move': {
      const w = state.items[action.id];
      if (!w) return state;
      return {
        ...state,
        items: { ...state.items, [action.id]: { ...w, x: action.x, y: action.y } as WidgetDef },
        dirty: true,
      };
    }
    case 'resize': {
      const w = state.items[action.id];
      if (!w) return state;
      return {
        ...state,
        items: { ...state.items, [action.id]: { ...w, w: Math.max(40, action.w), h: Math.max(30, action.h) } as WidgetDef },
        dirty: true,
      };
    }
    case 'updateProps': {
      const w = state.items[action.id];
      if (!w) return state;
      const merged = { ...((w as any).props ?? {}), ...action.patch };
      return {
        ...state,
        items: { ...state.items, [action.id]: { ...w, props: merged } as WidgetDef },
        dirty: true,
      };
    }
    case 'setBindings': {
      const w = state.items[action.id];
      if (!w) return state;
      return {
        ...state,
        items: { ...state.items, [action.id]: { ...w, bindings: action.bindings.length ? action.bindings : undefined } as WidgetDef },
        dirty: true,
      };
    }
    case 'delete': {
      const { [action.id]: _removed, ...rest } = state.items;
      return {
        ...state,
        items: rest,
        selectedId: state.selectedId === action.id ? null : state.selectedId,
        dirty: true,
      };
    }
  }
}

export function useEditorState(view: ScadaView) {
  return useReducer(editorReducer, view, (v) => ({
    items: { ...(v.items ?? {}) },
    selectedId: null,
    baselineUpdatedAt: v.updated_at,
    dirty: false,
  }));
}

export function generateWidgetId(type: string): string {
  return `${type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
