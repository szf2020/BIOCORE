# SCADA Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a SCADA editor (sub-project 5/7) at `/scada/[viewId]/edit` (admin/engineer only) with widget palette → drag-drop canvas → property panel (schema-driven) → save via existing PUT REST.

**Architecture:** 3-column layout (Palette / Canvas / PropertyPanel). State lives in a `useReducer` (`useEditorState`). Native HTML5 drag-drop palette→canvas; pointer events for move/resize. `WIDGET_REGISTRY` extended with `propsSchema` (per-prop input spec) and `bindableProps` (binding dropdown source). PropertyEditor renders inputs from schema (no per-widget code). Save = displayed dirty + button + optimistic-lock 409 confirm.

**Tech Stack:** TypeScript, React 18, Next.js 14 App Router, Tailwind CSS, vitest 1.6 + @testing-library/react 14 + jsdom. Reuses sub-project 3 widgets (`BoundWidget`, `WIDGET_REGISTRY`) and sub-project 4 `api/scada.ts`. No new npm deps.

**Spec reference:** `docs/superpowers/specs/2026-05-15-scada-editor-design.md`

---

## File Structure

**New (web-ui):**
- `packages/web-ui/src/hooks/useEditorState.ts` — items reducer + initial state + `generateWidgetId` helper
- `packages/web-ui/src/hooks/__tests__/useEditorState.test.ts` (4)
- `packages/web-ui/src/components/scada/editor/EditorShell.tsx`
- `packages/web-ui/src/components/scada/editor/WidgetPalette.tsx`
- `packages/web-ui/src/components/scada/editor/EditorCanvas.tsx`
- `packages/web-ui/src/components/scada/editor/WidgetItem.tsx`
- `packages/web-ui/src/components/scada/editor/PropertyPanel.tsx`
- `packages/web-ui/src/components/scada/editor/PropertyEditor.tsx`
- `packages/web-ui/src/components/scada/editor/BindingsEditor.tsx`
- `packages/web-ui/src/components/scada/editor/SaveBar.tsx`
- `packages/web-ui/src/components/scada/editor/NewViewDialog.tsx`
- `packages/web-ui/src/components/scada/editor/__tests__/` (9 test files = 22 cases)
- `packages/web-ui/src/app/scada/[viewId]/edit/page.tsx`

**Modified:**
- `packages/web-ui/src/widgets/registry.ts` — add `PropSchema` interface + `propsSchema` + `bindableProps` per entry
- `packages/web-ui/src/widgets/__tests__/registry.test.ts` — add 1 case verifying schema coverage
- `packages/web-ui/src/api/scada.ts` — add `updateView` + `createView`
- `packages/web-ui/src/app/scada/page.tsx` — add "新建视图" button + NewViewDialog mount

**No server-side edits, no new npm deps.**

---

## Task 1: Registry — propsSchema + bindableProps + registry test

**Files:**
- Modify: `packages/web-ui/src/widgets/registry.ts`
- Modify: `packages/web-ui/src/widgets/__tests__/registry.test.ts`

- [ ] **Step 1: Write the failing test**

Append the following test to `/Volumes/SSD/BIOCORE/packages/web-ui/src/widgets/__tests__/registry.test.ts` (inside the existing `describe('WIDGET_REGISTRY', ...)` block, AFTER the existing test):

```ts
  it('2. each entry has non-empty propsSchema + bindableProps array', () => {
    const keys = ['tank','valve','pump','indicator','trend','label','button','lamp'] as const;
    for (const k of keys) {
      const entry = WIDGET_REGISTRY[k] as any;
      expect(entry.propsSchema).toBeDefined();
      expect(typeof entry.propsSchema).toBe('object');
      expect(Object.keys(entry.propsSchema).length).toBeGreaterThan(0);
      expect(Array.isArray(entry.bindableProps)).toBe(true);
    }
  });
```

- [ ] **Step 2: Verify RED**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npm test -- --run registry 2>&1 | tail -15`
Expected: FAIL — `propsSchema` undefined on entries.

- [ ] **Step 3: Extend registry.ts**

Replace the entire contents of `/Volumes/SSD/BIOCORE/packages/web-ui/src/widgets/registry.ts` with:

```ts
import React from 'react';
import { Tank } from './Tank';
import { Valve } from './Valve';
import { Pump } from './Pump';
import { Indicator } from './Indicator';
import { Trend } from './Trend';
import { Label } from './Label';
import { Button } from './Button';
import { Lamp } from './Lamp';

export interface PropSchema {
  type: 'number' | 'string' | 'boolean' | 'color' | 'select' | 'textarea';
  label: string;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
}

export interface WidgetEntry<P> {
  component: React.ComponentType<P & { width: number; height: number }>;
  defaultProps: () => P;
  displayName: string;
  propsSchema: Record<string, PropSchema>;
  bindableProps: string[];
}

export const WIDGET_REGISTRY = {
  tank: {
    component: Tank,
    defaultProps: () => ({ fillPct: 50, max: 100, color: '#3b82f6' }),
    displayName: '罐体',
    propsSchema: {
      fillPct: { type: 'number', label: '液位 %', min: 0, max: 100 },
      max:     { type: 'number', label: 'Max', min: 1 },
      unit:    { type: 'string', label: '单位' },
      label:   { type: 'string', label: '标签' },
      color:   { type: 'color',  label: '颜色' },
    },
    bindableProps: ['fillPct', 'max'],
  },
  valve: {
    component: Valve,
    defaultProps: () => ({ open: false, colorOpen: '#22c55e', colorClosed: '#9ca3af' }),
    displayName: '阀门',
    propsSchema: {
      open:         { type: 'boolean', label: '开 (true=开)' },
      label:        { type: 'string',  label: '标签' },
      colorOpen:    { type: 'color',   label: '开色' },
      colorClosed:  { type: 'color',   label: '关色' },
    },
    bindableProps: ['open'],
  },
  pump: {
    component: Pump,
    defaultProps: () => ({ running: false, rate: 0, unit: 'rpm' }),
    displayName: '泵',
    propsSchema: {
      running: { type: 'boolean', label: '运行' },
      rate:    { type: 'number',  label: '速率' },
      unit:    { type: 'string',  label: '单位' },
      label:   { type: 'string',  label: '标签' },
    },
    bindableProps: ['running', 'rate'],
  },
  indicator: {
    component: Indicator,
    defaultProps: () => ({ value: null as number | string | null, unit: '', precision: 1 }),
    displayName: '数字表',
    propsSchema: {
      value:     { type: 'string', label: '当前值 (绑定后由 tag 注入)' },
      unit:      { type: 'string', label: '单位' },
      precision: { type: 'number', label: '小数位', min: 0, max: 6, step: 1 },
      label:     { type: 'string', label: '标签' },
      color:     { type: 'color',  label: '颜色' },
    },
    bindableProps: ['value'],
  },
  trend: {
    component: Trend,
    defaultProps: () => ({ series: [] as Array<{ tag: string; label?: string; color?: string }>, windowSec: 60 }),
    displayName: '趋势图',
    propsSchema: {
      windowSec: { type: 'number', label: '窗口秒', min: 10, max: 3600 },
      yMin:      { type: 'number', label: 'Y 最小' },
      yMax:      { type: 'number', label: 'Y 最大' },
      staleMs:   { type: 'number', label: '失效毫秒', min: 1000 },
    },
    bindableProps: [],
  },
  label: {
    component: Label,
    defaultProps: () => ({ text: '', fontSize: 14, align: 'left' as const }),
    displayName: '文本',
    propsSchema: {
      text:     { type: 'string',  label: '文本' },
      fontSize: { type: 'number',  label: '字号', min: 8, max: 64 },
      bold:     { type: 'boolean', label: '加粗' },
      align:    { type: 'select',  label: '对齐', options: [
        { value: 'left',   label: '左' },
        { value: 'center', label: '中' },
        { value: 'right',  label: '右' },
      ]},
      color:    { type: 'color',   label: '颜色' },
    },
    bindableProps: [],
  },
  button: {
    component: Button,
    defaultProps: () => ({ text: 'Action', color: '#3b82f6' }),
    displayName: '按钮',
    propsSchema: {
      text:   { type: 'string',   label: '文本' },
      action: { type: 'string',   label: 'action 类型' },
      color:  { type: 'color',    label: '颜色' },
    },
    bindableProps: [],
  },
  lamp: {
    component: Lamp,
    defaultProps: () => ({ on: false, colorOn: '#ef4444', colorOff: '#e5e7eb' }),
    displayName: '指示灯',
    propsSchema: {
      on:       { type: 'boolean', label: '亮' },
      blink:    { type: 'boolean', label: '闪烁' },
      colorOn:  { type: 'color',   label: '亮色' },
      colorOff: { type: 'color',   label: '灭色' },
      label:    { type: 'string',  label: '标签' },
    },
    bindableProps: ['on'],
  },
} as const;

export type WidgetRegistry = typeof WIDGET_REGISTRY;
```

- [ ] **Step 4: Verify GREEN**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npm test -- --run registry 2>&1 | tail -15`
Expected: 2/2 PASS.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/widgets/registry.ts packages/web-ui/src/widgets/__tests__/registry.test.ts
git commit -m "feat(web-ui): widget registry — propsSchema + bindableProps per entry (sub-project 5/7)"
```

---

## Task 2: useEditorState reducer + 4 tests

**Files:**
- Create: `packages/web-ui/src/hooks/useEditorState.ts`
- Create: `packages/web-ui/src/hooks/__tests__/useEditorState.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Volumes/SSD/BIOCORE/packages/web-ui/src/hooks/__tests__/useEditorState.test.ts`:

```ts
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
```

- [ ] **Step 2: Verify RED**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npm test -- --run useEditorState 2>&1 | tail -15`
Expected: FAIL — module not found.

- [ ] **Step 3: Write useEditorState.ts**

Create `/Volumes/SSD/BIOCORE/packages/web-ui/src/hooks/useEditorState.ts`:

```ts
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
```

- [ ] **Step 4: GREEN**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npm test -- --run useEditorState 2>&1 | tail -15`
Expected: 4/4 PASS.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/hooks/useEditorState.ts packages/web-ui/src/hooks/__tests__/useEditorState.test.ts
git commit -m "feat(web-ui): useEditorState reducer (items add/move/resize/props/bindings/delete) + 4 tests"
```

---

## Task 3: api/scada.ts — updateView + createView

**Files:**
- Modify: `packages/web-ui/src/api/scada.ts`

(No standalone test — exercised by SaveBar + NewViewDialog mocks.)

- [ ] **Step 1: Append the two new exports**

Open `/Volumes/SSD/BIOCORE/packages/web-ui/src/api/scada.ts`. Append AFTER the existing `submitWriteIntent` function (at end of file):

```ts

export async function updateView(
  viewId: string,
  body: {
    items?: Record<string, any>;
    expected_updated_at?: string;
    name?: string;
    reactor_id?: string | null;
    width?: number;
    height?: number;
    background?: string;
  },
): Promise<{ success: boolean; updated_at: string }> {
  const r = await fetch(`${API}/api/v1/scada/views/${viewId}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: 'unknown' }));
    throw new Error(err.error || `updateView ${r.status}`);
  }
  return r.json();
}

export async function createView(
  projectId: string,
  body: {
    view_id: string;
    name: string;
    reactor_id?: string | null;
    width?: number;
    height?: number;
    background?: string;
    items?: Record<string, any>;
  },
): Promise<{ success: boolean; view_id: string }> {
  const r = await fetch(`${API}/api/v1/scada/projects/${projectId}/views`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: 'unknown' }));
    throw new Error(err.error || `createView ${r.status}`);
  }
  return r.json();
}
```

- [ ] **Step 2: TS check scoped**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npx tsc --noEmit 2>&1 | grep "src/api/scada" | head -10`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/api/scada.ts
git commit -m "feat(web-ui): api/scada.ts add updateView + createView (sub-project 5/7)"
```

---

## Task 4: WidgetPalette + 2 tests

**Files:**
- Create: `packages/web-ui/src/components/scada/editor/WidgetPalette.tsx`
- Create: `packages/web-ui/src/components/scada/editor/__tests__/WidgetPalette.test.tsx`

- [ ] **Step 1: Write test**

Create `/Volumes/SSD/BIOCORE/packages/web-ui/src/components/scada/editor/__tests__/WidgetPalette.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WidgetPalette } from '../WidgetPalette';

describe('WidgetPalette', () => {
  it('1. renders 8 cards with displayName', () => {
    render(<WidgetPalette />);
    const expected = ['罐体','阀门','泵','数字表','趋势图','文本','按钮','指示灯'];
    for (const name of expected) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });

  it('2. dragstart sets dataTransfer with widget type', () => {
    const { container } = render(<WidgetPalette />);
    const tank = container.querySelector('[data-widget-type="tank"]') as HTMLElement;
    expect(tank).toBeTruthy();
    const setData = vi.fn();
    fireEvent.dragStart(tank, { dataTransfer: { setData } });
    expect(setData).toHaveBeenCalledWith('application/x-scada-widget-type', 'tank');
  });
});
```

- [ ] **Step 2: RED**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npm test -- --run WidgetPalette 2>&1 | tail -15`
Expected: FAIL — `WidgetPalette` not exported.

- [ ] **Step 3: Write the component**

Create `/Volumes/SSD/BIOCORE/packages/web-ui/src/components/scada/editor/WidgetPalette.tsx`:

```tsx
'use client';
import React from 'react';
import { WIDGET_REGISTRY } from '@/widgets/registry';

export function WidgetPalette() {
  const keys = Object.keys(WIDGET_REGISTRY) as Array<keyof typeof WIDGET_REGISTRY>;
  return (
    <div className="p-3 space-y-2 overflow-y-auto bg-white border-r" style={{ width: 180 }}>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">控件</h3>
      {keys.map(k => {
        const entry = WIDGET_REGISTRY[k];
        return (
          <div
            key={k}
            data-widget-type={k}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('application/x-scada-widget-type', k)}
            className="px-3 py-2 border rounded bg-white cursor-grab text-sm hover:bg-gray-50 select-none"
          >
            {entry.displayName}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: GREEN**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npm test -- --run WidgetPalette 2>&1 | tail -15`
Expected: 2/2 PASS.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/components/scada/editor/WidgetPalette.tsx packages/web-ui/src/components/scada/editor/__tests__/WidgetPalette.test.tsx
git commit -m "feat(web-ui): scada editor WidgetPalette (8 draggable cards) + 2 tests"
```

---

## Task 5: EditorCanvas + 3 tests

**Files:**
- Create: `packages/web-ui/src/components/scada/editor/EditorCanvas.tsx`
- Create: `packages/web-ui/src/components/scada/editor/__tests__/EditorCanvas.test.tsx`

- [ ] **Step 1: Write test**

Create `/Volumes/SSD/BIOCORE/packages/web-ui/src/components/scada/editor/__tests__/EditorCanvas.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

vi.mock('../WidgetItem', () => ({
  WidgetItem: ({ widget, isSelected }: any) => (
    <div data-testid="widget-item" data-id={widget.id} data-selected={isSelected ? '1' : '0'} />
  ),
}));

import { EditorCanvas } from '../EditorCanvas';

describe('EditorCanvas', () => {
  it('1. onDrop fires with extracted type + xy coords', () => {
    const onAdd = vi.fn();
    const view = { width: 800, height: 480, background: '#fff' };
    const { container } = render(
      <EditorCanvas view={view as any} items={{}} selectedId={null} onSelect={vi.fn()} onAdd={onAdd} onMove={vi.fn()} onResize={vi.fn()} />
    );
    const canvas = container.querySelector('[data-testid="scada-edit-canvas"]') as HTMLElement;
    fireEvent.drop(canvas, {
      clientX: 120, clientY: 80,
      dataTransfer: { getData: (_k: string) => 'tank' },
    });
    expect(onAdd).toHaveBeenCalledTimes(1);
    const arg = onAdd.mock.calls[0][0];
    expect(arg.type).toBe('tank');
    expect(arg.x).toBe(120);
    expect(arg.y).toBe(80);
  });

  it('2. renders one WidgetItem per item, marks selected', () => {
    const view = { width: 800, height: 480, background: '#fff' };
    const items = {
      a: { id: 'a', type: 'tank', x: 0, y: 0, w: 10, h: 10, props: {} },
      b: { id: 'b', type: 'label', x: 0, y: 0, w: 10, h: 10, props: {} },
    };
    const { container } = render(
      <EditorCanvas view={view as any} items={items as any} selectedId={'a'} onSelect={vi.fn()} onAdd={vi.fn()} onMove={vi.fn()} onResize={vi.fn()} />
    );
    const items_ = container.querySelectorAll('[data-testid="widget-item"]');
    expect(items_).toHaveLength(2);
    const selected = Array.from(items_).find(el => el.getAttribute('data-selected') === '1');
    expect(selected?.getAttribute('data-id')).toBe('a');
  });

  it('3. mousedown on empty canvas → onSelect(null)', () => {
    const onSelect = vi.fn();
    const view = { width: 800, height: 480, background: '#fff' };
    const { container } = render(
      <EditorCanvas view={view as any} items={{}} selectedId={'x'} onSelect={onSelect} onAdd={vi.fn()} onMove={vi.fn()} onResize={vi.fn()} />
    );
    const canvas = container.querySelector('[data-testid="scada-edit-canvas"]') as HTMLElement;
    fireEvent.mouseDown(canvas);
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Step 2: RED**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npm test -- --run EditorCanvas 2>&1 | tail -15`
Expected: FAIL.

- [ ] **Step 3: Write the component**

Create `/Volumes/SSD/BIOCORE/packages/web-ui/src/components/scada/editor/EditorCanvas.tsx`:

```tsx
'use client';
import React from 'react';
import type { ScadaView } from '@/api/scada';
import type { WidgetDef } from '@/widgets';
import { WIDGET_REGISTRY } from '@/widgets/registry';
import { generateWidgetId } from '@/hooks/useEditorState';
import { WidgetItem } from './WidgetItem';

export interface EditorCanvasProps {
  view: Pick<ScadaView, 'width' | 'height' | 'background'>;
  items: Record<string, WidgetDef>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (widget: WidgetDef) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, w: number, h: number) => void;
}

export function EditorCanvas({
  view, items, selectedId, onSelect, onAdd, onMove, onResize,
}: EditorCanvasProps) {
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/x-scada-widget-type');
    if (!type || !(WIDGET_REGISTRY as any)[type]) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    const entry = (WIDGET_REGISTRY as any)[type];
    onAdd({
      id: generateWidgetId(type),
      type: type as any,
      x, y,
      w: 80, h: 80,
      props: entry.defaultProps(),
    } as WidgetDef);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onSelect(null);
  };

  return (
    <div
      data-testid="scada-edit-canvas"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onMouseDown={handleMouseDown}
      style={{
        position: 'relative',
        width: `${view.width}px`,
        height: `${view.height}px`,
        background: view.background,
        margin: '16px',
        overflow: 'hidden',
        boxShadow: '0 0 0 1px #e5e7eb',
      }}
    >
      {Object.values(items).map((item) => (
        <WidgetItem
          key={`${item.id}:${item.bindings?.length ?? 0}`}
          widget={item}
          isSelected={item.id === selectedId}
          onSelect={onSelect}
          onMove={onMove}
          onResize={onResize}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: GREEN**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npm test -- --run EditorCanvas 2>&1 | tail -15`
Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/components/scada/editor/EditorCanvas.tsx packages/web-ui/src/components/scada/editor/__tests__/EditorCanvas.test.tsx
git commit -m "feat(web-ui): scada editor EditorCanvas (drop zone, WidgetItem map, deselect) + 3 tests"
```

---

## Task 6: WidgetItem + 3 tests

**Files:**
- Create: `packages/web-ui/src/components/scada/editor/WidgetItem.tsx`
- Create: `packages/web-ui/src/components/scada/editor/__tests__/WidgetItem.test.tsx`

- [ ] **Step 1: Write test**

Create `/Volumes/SSD/BIOCORE/packages/web-ui/src/components/scada/editor/__tests__/WidgetItem.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

vi.mock('@/widgets', () => ({
  BoundWidget: ({ widget }: any) => <div data-testid="bw" data-id={widget.id} />,
}));

import { WidgetItem } from '../WidgetItem';

const w = { id: 't1', type: 'tank', x: 10, y: 20, w: 80, h: 200, props: {} } as any;

describe('WidgetItem', () => {
  it('1. not selected: no resize handle, data-selected=0', () => {
    const { container } = render(
      <WidgetItem widget={w} isSelected={false} onSelect={vi.fn()} onMove={vi.fn()} onResize={vi.fn()} />
    );
    expect(container.querySelector('[data-handle="se"]')).toBeNull();
    const wrap = container.querySelector('[data-testid="widget-item"]') as HTMLElement;
    expect(wrap.getAttribute('data-selected')).toBe('0');
  });

  it('2. selected: outline + handle, mousedown on body triggers onSelect(id)', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <WidgetItem widget={w} isSelected={true} onSelect={onSelect} onMove={vi.fn()} onResize={vi.fn()} />
    );
    expect(container.querySelector('[data-handle="se"]')).toBeTruthy();
    const wrap = container.querySelector('[data-testid="widget-item"]') as HTMLElement;
    expect(wrap.getAttribute('data-selected')).toBe('1');
    fireEvent.mouseDown(wrap);
    expect(onSelect).toHaveBeenCalledWith('t1');
  });

  it('3. mousedown on handle does NOT call onSelect (handle short-circuits)', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <WidgetItem widget={w} isSelected={true} onSelect={onSelect} onMove={vi.fn()} onResize={vi.fn()} />
    );
    onSelect.mockClear();
    const handle = container.querySelector('[data-handle="se"]') as HTMLElement;
    fireEvent.mouseDown(handle, { clientX: 0, clientY: 0 });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: RED**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npm test -- --run WidgetItem 2>&1 | tail -15`
Expected: FAIL.

- [ ] **Step 3: Write the component**

Create `/Volumes/SSD/BIOCORE/packages/web-ui/src/components/scada/editor/WidgetItem.tsx`:

```tsx
'use client';
import React from 'react';
import { BoundWidget } from '@/widgets';
import type { WidgetDef } from '@/widgets';

export interface WidgetItemProps {
  widget: WidgetDef;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, w: number, h: number) => void;
}

export function WidgetItem({ widget, isSelected, onSelect, onMove, onResize }: WidgetItemProps) {
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-handle]')) {
      return;
    }
    e.stopPropagation();
    onSelect(widget.id);

    const startX = e.clientX;
    const startY = e.clientY;
    const origX = widget.x;
    const origY = widget.y;
    const onMoveDoc = (ev: MouseEvent) => {
      onMove(widget.id, origX + (ev.clientX - startX), origY + (ev.clientY - startY));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMoveDoc);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMoveDoc);
    document.addEventListener('mouseup', onUp);
  };

  const handleResizeDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const origW = widget.w;
    const origH = widget.h;
    const onMoveDoc = (ev: MouseEvent) => {
      onResize(widget.id, origW + (ev.clientX - startX), origH + (ev.clientY - startY));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMoveDoc);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMoveDoc);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div
      data-testid="widget-item"
      data-id={widget.id}
      data-selected={isSelected ? '1' : '0'}
      onMouseDown={handleMouseDown}
      style={{
        position: 'absolute',
        left: widget.x,
        top: widget.y,
        width: widget.w,
        height: widget.h,
        outline: isSelected ? '2px solid #3b82f6' : 'none',
        outlineOffset: '-2px',
        cursor: 'move',
      }}
    >
      <BoundWidget widget={widget} />
      {isSelected && (
        <div
          data-handle="se"
          onMouseDown={handleResizeDown}
          style={{
            position: 'absolute',
            right: -5, bottom: -5,
            width: 10, height: 10,
            background: '#3b82f6',
            cursor: 'se-resize',
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: GREEN**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npm test -- --run WidgetItem 2>&1 | tail -15`
Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/components/scada/editor/WidgetItem.tsx packages/web-ui/src/components/scada/editor/__tests__/WidgetItem.test.tsx
git commit -m "feat(web-ui): scada editor WidgetItem (drag-move + se-resize handle + select) + 3 tests"
```

---

## Task 7: PropertyEditor + 4 tests

**Files:**
- Create: `packages/web-ui/src/components/scada/editor/PropertyEditor.tsx`
- Create: `packages/web-ui/src/components/scada/editor/__tests__/PropertyEditor.test.tsx`

- [ ] **Step 1: Write test**

Create `/Volumes/SSD/BIOCORE/packages/web-ui/src/components/scada/editor/__tests__/PropertyEditor.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { PropertyEditor } from '../PropertyEditor';

describe('PropertyEditor', () => {
  it('1. number schema → input type=number, onChange emits number', () => {
    const onChange = vi.fn();
    const { container } = render(
      <PropertyEditor
        schema={{ fillPct: { type: 'number', label: '液位 %', min: 0, max: 100 } }}
        values={{ fillPct: 50 }}
        onChange={onChange}
      />
    );
    const input = container.querySelector('input[type="number"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('50');
    fireEvent.change(input, { target: { value: '75' } });
    expect(onChange).toHaveBeenCalledWith({ fillPct: 75 });
  });

  it('2. string schema → input type=text, onChange emits string', () => {
    const onChange = vi.fn();
    const { container } = render(
      <PropertyEditor
        schema={{ label: { type: 'string', label: '标签' } }}
        values={{ label: 'A' }}
        onChange={onChange}
      />
    );
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'AB' } });
    expect(onChange).toHaveBeenCalledWith({ label: 'AB' });
  });

  it('3. color schema → input type=color', () => {
    const onChange = vi.fn();
    const { container } = render(
      <PropertyEditor
        schema={{ color: { type: 'color', label: '颜色' } }}
        values={{ color: '#3b82f6' }}
        onChange={onChange}
      />
    );
    const input = container.querySelector('input[type="color"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: '#ff0000' } });
    expect(onChange).toHaveBeenCalledWith({ color: '#ff0000' });
  });

  it('4. select schema → dropdown with options, onChange emits selected value', () => {
    const onChange = vi.fn();
    const { container } = render(
      <PropertyEditor
        schema={{ align: { type: 'select', label: '对齐', options: [
          { value: 'left', label: '左' },
          { value: 'center', label: '中' },
          { value: 'right', label: '右' },
        ]}}}
        values={{ align: 'left' }}
        onChange={onChange}
      />
    );
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.options).toHaveLength(3);
    fireEvent.change(select, { target: { value: 'center' } });
    expect(onChange).toHaveBeenCalledWith({ align: 'center' });
  });
});
```

- [ ] **Step 2: RED**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npm test -- --run PropertyEditor 2>&1 | tail -15`
Expected: FAIL.

- [ ] **Step 3: Write the component**

Create `/Volumes/SSD/BIOCORE/packages/web-ui/src/components/scada/editor/PropertyEditor.tsx`:

```tsx
'use client';
import React from 'react';
import type { PropSchema } from '@/widgets/registry';

export interface PropertyEditorProps {
  schema: Record<string, PropSchema>;
  values: Record<string, any>;
  onChange: (patch: Record<string, any>) => void;
}

export function PropertyEditor({ schema, values, onChange }: PropertyEditorProps) {
  return (
    <div className="space-y-2">
      {Object.entries(schema).map(([key, sch]) => {
        const v = values?.[key];
        return (
          <div key={key} className="space-y-1">
            <label className="block text-xs text-gray-600">{sch.label}</label>
            {renderInput(key, sch, v, (val) => onChange({ [key]: val }))}
          </div>
        );
      })}
    </div>
  );
}

function renderInput(key: string, schema: PropSchema, value: any, set: (v: any) => void) {
  switch (schema.type) {
    case 'number':
      return (
        <input
          type="number"
          value={value ?? ''}
          min={schema.min}
          max={schema.max}
          step={schema.step ?? 1}
          onChange={(e) => set(e.target.value === '' ? undefined : Number(e.target.value))}
          className="w-full border rounded px-2 py-1 text-sm"
        />
      );
    case 'string':
      return (
        <input
          type="text"
          value={value ?? ''}
          onChange={(e) => set(e.target.value)}
          className="w-full border rounded px-2 py-1 text-sm"
        />
      );
    case 'textarea':
      return (
        <textarea
          value={value ?? ''}
          onChange={(e) => set(e.target.value)}
          rows={3}
          className="w-full border rounded px-2 py-1 text-sm"
        />
      );
    case 'color':
      return (
        <input
          type="color"
          value={value ?? '#000000'}
          onChange={(e) => set(e.target.value)}
          className="w-12 h-7 border rounded"
        />
      );
    case 'boolean':
      return (
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => set(e.target.checked)}
        />
      );
    case 'select':
      return (
        <select
          value={value ?? ''}
          onChange={(e) => set(e.target.value)}
          className="w-full border rounded px-2 py-1 text-sm"
        >
          {(schema.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
  }
}
```

- [ ] **Step 4: GREEN**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npm test -- --run PropertyEditor 2>&1 | tail -15`
Expected: 4/4 PASS.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/components/scada/editor/PropertyEditor.tsx packages/web-ui/src/components/scada/editor/__tests__/PropertyEditor.test.tsx
git commit -m "feat(web-ui): scada editor PropertyEditor (schema-driven number/string/color/select/...) + 4 tests"
```

---

## Task 8: BindingsEditor + 3 tests

**Files:**
- Create: `packages/web-ui/src/components/scada/editor/BindingsEditor.tsx`
- Create: `packages/web-ui/src/components/scada/editor/__tests__/BindingsEditor.test.tsx`

- [ ] **Step 1: Write test**

Create `/Volumes/SSD/BIOCORE/packages/web-ui/src/components/scada/editor/__tests__/BindingsEditor.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BindingsEditor } from '../BindingsEditor';

describe('BindingsEditor', () => {
  it('1. click 添加绑定 → onChange called with new binding appended', () => {
    const onChange = vi.fn();
    render(
      <BindingsEditor bindings={[]} bindableProps={['fillPct', 'max']} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole('button', { name: /添加绑定/ }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const result = onChange.mock.calls[0][0];
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ prop: 'fillPct', tag: '' });
  });

  it('2. click 删除 → onChange with that row removed', () => {
    const onChange = vi.fn();
    render(
      <BindingsEditor
        bindings={[{ tag: 't1', prop: 'fillPct' }, { tag: 't2', prop: 'max' }]}
        bindableProps={['fillPct', 'max']}
        onChange={onChange}
      />
    );
    const deletes = screen.getAllByRole('button', { name: /删除/ });
    fireEvent.click(deletes[0]);
    expect(onChange).toHaveBeenCalledWith([{ tag: 't2', prop: 'max' }]);
  });

  it('3. type into transform textarea → onChange with new transform', () => {
    const onChange = vi.fn();
    const { container } = render(
      <BindingsEditor
        bindings={[{ tag: 'F01.AI-0', prop: 'fillPct' }]}
        bindableProps={['fillPct']}
        onChange={onChange}
      />
    );
    const ta = container.querySelector('textarea[name="transform"]') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'v * 2' } });
    expect(onChange).toHaveBeenCalledWith([
      { tag: 'F01.AI-0', prop: 'fillPct', transform: 'v * 2' },
    ]);
  });
});
```

- [ ] **Step 2: RED**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npm test -- --run BindingsEditor 2>&1 | tail -15`
Expected: FAIL.

- [ ] **Step 3: Write the component**

Create `/Volumes/SSD/BIOCORE/packages/web-ui/src/components/scada/editor/BindingsEditor.tsx`:

```tsx
'use client';
import React from 'react';
import type { Binding } from '@/widgets';

export interface BindingsEditorProps {
  bindings: Binding[];
  bindableProps: string[];
  onChange: (next: Binding[]) => void;
}

export function BindingsEditor({ bindings, bindableProps, onChange }: BindingsEditorProps) {
  const handleAdd = () => {
    const defaultProp = bindableProps[0] ?? '';
    onChange([...bindings, { tag: '', prop: defaultProp }]);
  };

  const update = (idx: number, patch: Partial<Binding>) => {
    const next = bindings.map((b, i) => (i === idx ? { ...b, ...patch } : b));
    const cleaned = next.map((b) => {
      if (!b.transform || b.transform.trim() === '') {
        const { transform: _t, ...rest } = b;
        return rest as Binding;
      }
      return b;
    });
    onChange(cleaned);
  };

  const remove = (idx: number) => {
    onChange(bindings.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700">绑定 (Bindings)</span>
        <button
          type="button"
          onClick={handleAdd}
          disabled={bindableProps.length === 0}
          className="text-xs text-blue-600 disabled:text-gray-400"
        >
          + 添加绑定
        </button>
      </div>
      {bindings.length === 0 && (
        <div className="text-xs text-gray-400 italic">无绑定</div>
      )}
      {bindings.map((b, i) => (
        <div key={i} className="border rounded p-2 space-y-1 bg-gray-50">
          <div className="grid grid-cols-2 gap-1">
            <div>
              <label className="block text-xs text-gray-600">字段</label>
              <select
                value={b.prop}
                onChange={(e) => update(i, { prop: e.target.value })}
                className="w-full border rounded px-2 py-1 text-xs"
              >
                {bindableProps.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600">Tag</label>
              <input
                type="text"
                value={b.tag}
                onChange={(e) => update(i, { tag: e.target.value })}
                className="w-full border rounded px-2 py-1 text-xs"
                placeholder="F01.AI-0"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-600">变换 (可选, v=原值)</label>
            <textarea
              name="transform"
              value={b.transform ?? ''}
              onChange={(e) => update(i, { transform: e.target.value })}
              rows={2}
              className="w-full border rounded px-2 py-1 text-xs font-mono"
              placeholder="Math.min(100, (v / 50) * 100)"
            />
          </div>
          <div className="text-right">
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-xs text-red-600"
            >
              删除
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: GREEN**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npm test -- --run BindingsEditor 2>&1 | tail -15`
Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/components/scada/editor/BindingsEditor.tsx packages/web-ui/src/components/scada/editor/__tests__/BindingsEditor.test.tsx
git commit -m "feat(web-ui): scada editor BindingsEditor (add/remove/transform per row) + 3 tests"
```

---

## Task 9: PropertyPanel + 2 tests

**Files:**
- Create: `packages/web-ui/src/components/scada/editor/PropertyPanel.tsx`
- Create: `packages/web-ui/src/components/scada/editor/__tests__/PropertyPanel.test.tsx`

- [ ] **Step 1: Write test**

Create `/Volumes/SSD/BIOCORE/packages/web-ui/src/components/scada/editor/__tests__/PropertyPanel.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../PropertyEditor', () => ({
  PropertyEditor: ({ schema }: any) => <div data-testid="prop-editor" data-keys={Object.keys(schema).join(',')} />,
}));
vi.mock('../BindingsEditor', () => ({
  BindingsEditor: ({ bindings }: any) => <div data-testid="bind-editor" data-count={bindings.length} />,
}));

import { PropertyPanel } from '../PropertyPanel';

describe('PropertyPanel', () => {
  it('1. selectedId null → "未选中" placeholder', () => {
    render(<PropertyPanel selected={null} dispatch={vi.fn()} />);
    expect(screen.getByText(/未选中/)).toBeTruthy();
  });

  it('2. selected widget → displayName header + PropertyEditor + BindingsEditor', () => {
    const widget = { id: 't1', type: 'tank', x: 0, y: 0, w: 80, h: 200, props: { color: '#000' }, bindings: [{ tag: 't', prop: 'fillPct' }] } as any;
    render(<PropertyPanel selected={widget} dispatch={vi.fn()} />);
    expect(screen.getByText('罐体')).toBeTruthy();
    expect(screen.getByTestId('prop-editor')).toBeTruthy();
    expect(screen.getByTestId('bind-editor').getAttribute('data-count')).toBe('1');
  });
});
```

- [ ] **Step 2: RED**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npm test -- --run PropertyPanel 2>&1 | tail -15`
Expected: FAIL.

- [ ] **Step 3: Write the component**

Create `/Volumes/SSD/BIOCORE/packages/web-ui/src/components/scada/editor/PropertyPanel.tsx`:

```tsx
'use client';
import React from 'react';
import type { WidgetDef, Binding } from '@/widgets';
import { WIDGET_REGISTRY } from '@/widgets/registry';
import type { EditorAction } from '@/hooks/useEditorState';
import { PropertyEditor } from './PropertyEditor';
import { BindingsEditor } from './BindingsEditor';

export interface PropertyPanelProps {
  selected: WidgetDef | null;
  dispatch: React.Dispatch<EditorAction>;
}

export function PropertyPanel({ selected, dispatch }: PropertyPanelProps) {
  if (!selected) {
    return (
      <div className="p-4 text-xs text-gray-400 italic bg-white border-l" style={{ width: 280 }}>
        未选中。点击画布上的 widget 编辑属性。
      </div>
    );
  }
  const entry = (WIDGET_REGISTRY as any)[selected.type];
  if (!entry) {
    return <div className="p-4 text-xs text-red-600 bg-white border-l" style={{ width: 280 }}>未知 widget 类型: {selected.type}</div>;
  }
  const props = (selected as any).props ?? {};
  return (
    <div className="p-3 space-y-4 overflow-y-auto bg-white border-l" style={{ width: 280 }}>
      <div>
        <div className="text-sm font-semibold">{entry.displayName}</div>
        <div className="text-xs text-gray-400 font-mono">{selected.id}</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-600">X</label>
          <input type="number" value={selected.x}
            onChange={(e) => dispatch({ type: 'move', id: selected.id, x: Number(e.target.value), y: selected.y })}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-600">Y</label>
          <input type="number" value={selected.y}
            onChange={(e) => dispatch({ type: 'move', id: selected.id, x: selected.x, y: Number(e.target.value) })}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-600">宽</label>
          <input type="number" value={selected.w} min={40}
            onChange={(e) => dispatch({ type: 'resize', id: selected.id, w: Number(e.target.value), h: selected.h })}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-600">高</label>
          <input type="number" value={selected.h} min={30}
            onChange={(e) => dispatch({ type: 'resize', id: selected.id, w: selected.w, h: Number(e.target.value) })}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
      </div>

      <PropertyEditor
        schema={entry.propsSchema}
        values={props}
        onChange={(patch) => dispatch({ type: 'updateProps', id: selected.id, patch })}
      />

      <BindingsEditor
        bindings={selected.bindings ?? []}
        bindableProps={entry.bindableProps}
        onChange={(bindings: Binding[]) => dispatch({ type: 'setBindings', id: selected.id, bindings })}
      />

      <div className="pt-2 border-t">
        <button
          type="button"
          onClick={() => dispatch({ type: 'delete', id: selected.id })}
          className="text-xs text-red-600"
        >
          删除此 widget
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: GREEN**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npm test -- --run PropertyPanel 2>&1 | tail -15`
Expected: 2/2 PASS.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/components/scada/editor/PropertyPanel.tsx packages/web-ui/src/components/scada/editor/__tests__/PropertyPanel.test.tsx
git commit -m "feat(web-ui): scada editor PropertyPanel (xy/wh + PropertyEditor + BindingsEditor + delete) + 2 tests"
```

---

## Task 10: SaveBar + 2 tests

**Files:**
- Create: `packages/web-ui/src/components/scada/editor/SaveBar.tsx`
- Create: `packages/web-ui/src/components/scada/editor/__tests__/SaveBar.test.tsx`

- [ ] **Step 1: Write test**

Create `/Volumes/SSD/BIOCORE/packages/web-ui/src/components/scada/editor/__tests__/SaveBar.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/api/scada', () => ({
  updateView: vi.fn(async () => ({ success: true, updated_at: '2026-05-15T13:00:00Z' })),
  fetchView: vi.fn(async () => ({})),
}));

import { SaveBar } from '../SaveBar';
import * as scada from '@/api/scada';

function baseState(): any {
  return {
    items: { t1: { id: 't1', type: 'tank', x: 0, y: 0, w: 80, h: 200, props: {} } },
    selectedId: null,
    baselineUpdatedAt: '2026-05-15T00:00:00Z',
    dirty: false,
  };
}

describe('SaveBar', () => {
  beforeEach(() => {
    vi.mocked(scada.updateView).mockClear();
    vi.mocked(scada.updateView).mockResolvedValue({ success: true, updated_at: '2026-05-15T13:00:00Z' });
  });

  it('1. dirty=false → save button disabled', () => {
    render(<SaveBar state={baseState()} viewId="v1" dispatch={vi.fn()} />);
    const btn = screen.getByRole('button', { name: /保存/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('2. dirty=true + click save → updateView called, dispatch markSaved', async () => {
    const dispatch = vi.fn();
    render(<SaveBar state={{ ...baseState(), dirty: true }} viewId="v1" dispatch={dispatch} />);
    const btn = screen.getByRole('button', { name: /保存/ });
    fireEvent.click(btn);

    await waitFor(() => expect(scada.updateView).toHaveBeenCalledTimes(1));
    expect(scada.updateView).toHaveBeenCalledWith('v1', {
      items: baseState().items,
      expected_updated_at: '2026-05-15T00:00:00Z',
    });
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'markSaved', updated_at: '2026-05-15T13:00:00Z' })
    );
  });
});
```

- [ ] **Step 2: RED**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npm test -- --run SaveBar 2>&1 | tail -15`
Expected: FAIL.

- [ ] **Step 3: Write the component**

Create `/Volumes/SSD/BIOCORE/packages/web-ui/src/components/scada/editor/SaveBar.tsx`:

```tsx
'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { updateView, fetchView } from '@/api/scada';
import type { EditorState, EditorAction } from '@/hooks/useEditorState';

export interface SaveBarProps {
  state: EditorState;
  viewId: string;
  dispatch: React.Dispatch<EditorAction>;
}

export function SaveBar({ state, viewId, dispatch }: SaveBarProps) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSave = async () => {
    if (!state.dirty || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const r = await updateView(viewId, {
        items: state.items,
        expected_updated_at: state.baselineUpdatedAt,
      });
      dispatch({ type: 'markSaved', updated_at: r.updated_at });
      console.log('[scada-editor] saved', r.updated_at);
    } catch (e: any) {
      if (e?.message === 'concurrent_update') {
        if (confirm('其他人改了视图. 重新加载会丢失本次编辑. 继续?')) {
          try {
            const fresh = await fetchView(viewId);
            dispatch({ type: 'loadFromServer', view: fresh });
          } catch (err2: any) {
            setErr(err2?.message || 'reload_failed');
          }
        }
      } else {
        setErr(e?.message || 'save_failed');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-between border-b bg-white px-4 py-2">
      <div className="flex items-center gap-3 text-sm">
        <Link href={`/scada/${viewId}`} className="text-blue-600 hover:underline">← 退出编辑</Link>
        <span className="text-gray-400">/</span>
        <span className="font-mono text-xs text-gray-600">{viewId}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500">
          {state.dirty ? '● 未保存' : '✓ 已保存'}
        </span>
        {err && <span className="text-xs text-red-600">{err}</span>}
        <button
          type="button"
          onClick={handleSave}
          disabled={!state.dirty || saving}
          className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
        >
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: GREEN**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npm test -- --run SaveBar 2>&1 | tail -15`
Expected: 2/2 PASS.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/components/scada/editor/SaveBar.tsx packages/web-ui/src/components/scada/editor/__tests__/SaveBar.test.tsx
git commit -m "feat(web-ui): scada editor SaveBar (dirty + save + 409 confirm reload) + 2 tests"
```

---

## Task 11: EditorShell + NewViewDialog + index page button (1+2 tests)

**Files:**
- Create: `packages/web-ui/src/components/scada/editor/EditorShell.tsx`
- Create: `packages/web-ui/src/components/scada/editor/NewViewDialog.tsx`
- Create: `packages/web-ui/src/components/scada/editor/__tests__/EditorShell.test.tsx`
- Create: `packages/web-ui/src/components/scada/editor/__tests__/NewViewDialog.test.tsx`
- Modify: `packages/web-ui/src/app/scada/page.tsx`

- [ ] **Step 1: EditorShell test**

Create `/Volumes/SSD/BIOCORE/packages/web-ui/src/components/scada/editor/__tests__/EditorShell.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../WidgetPalette', () => ({ WidgetPalette: () => <div data-testid="palette" /> }));
vi.mock('../EditorCanvas', () => ({ EditorCanvas: () => <div data-testid="canvas" /> }));
vi.mock('../PropertyPanel', () => ({ PropertyPanel: () => <div data-testid="panel" /> }));
vi.mock('../SaveBar', () => ({ SaveBar: () => <div data-testid="savebar" /> }));

import { EditorShell } from '../EditorShell';

describe('EditorShell', () => {
  it('1. renders SaveBar + Palette + Canvas + PropertyPanel', () => {
    const view = { view_id: 'v1', project_id: 'p', name: 'V', reactor_id: null, width: 800, height: 480, background: '#fff', items: {}, updated_at: 'now' } as any;
    render(<EditorShell view={view} />);
    expect(screen.getByTestId('savebar')).toBeTruthy();
    expect(screen.getByTestId('palette')).toBeTruthy();
    expect(screen.getByTestId('canvas')).toBeTruthy();
    expect(screen.getByTestId('panel')).toBeTruthy();
  });
});
```

- [ ] **Step 2: EditorShell RED**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npm test -- --run EditorShell 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Write EditorShell**

Create `/Volumes/SSD/BIOCORE/packages/web-ui/src/components/scada/editor/EditorShell.tsx`:

```tsx
'use client';
import React, { useEffect } from 'react';
import type { ScadaView } from '@/api/scada';
import { useEditorState } from '@/hooks/useEditorState';
import { WidgetPalette } from './WidgetPalette';
import { EditorCanvas } from './EditorCanvas';
import { PropertyPanel } from './PropertyPanel';
import { SaveBar } from './SaveBar';

export function EditorShell({ view }: { view: ScadaView }) {
  const [state, dispatch] = useEditorState(view);
  const selected = state.selectedId ? state.items[state.selectedId] : null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'Escape') {
        dispatch({ type: 'select', id: null });
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId) {
        dispatch({ type: 'delete', id: state.selectedId });
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state.selectedId, dispatch]);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <SaveBar state={state} viewId={view.view_id} dispatch={dispatch} />
      <div className="flex flex-1 min-h-0">
        <WidgetPalette />
        <div className="flex-1 overflow-auto bg-gray-200">
          <EditorCanvas
            view={view}
            items={state.items}
            selectedId={state.selectedId}
            onSelect={(id) => dispatch({ type: 'select', id })}
            onAdd={(widget) => dispatch({ type: 'add', widget })}
            onMove={(id, x, y) => dispatch({ type: 'move', id, x, y })}
            onResize={(id, w, h) => dispatch({ type: 'resize', id, w, h })}
          />
        </div>
        <PropertyPanel selected={selected ?? null} dispatch={dispatch} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: EditorShell GREEN**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npm test -- --run EditorShell 2>&1 | tail -10`
Expected: 1/1 PASS.

- [ ] **Step 5: NewViewDialog test**

Create `/Volumes/SSD/BIOCORE/packages/web-ui/src/components/scada/editor/__tests__/NewViewDialog.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/api/scada', () => ({
  createView: vi.fn(async () => ({ success: true, view_id: 'new_v' })),
}));
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { NewViewDialog } from '../NewViewDialog';
import * as scada from '@/api/scada';

describe('NewViewDialog', () => {
  beforeEach(() => {
    pushMock.mockClear();
    vi.mocked(scada.createView).mockClear();
    vi.mocked(scada.createView).mockResolvedValue({ success: true, view_id: 'new_v' });
  });

  it('1. view_id or name empty → submit disabled', () => {
    render(
      <NewViewDialog
        open={true}
        projects={[{ project_id: 'p1', name: 'P1' } as any]}
        onClose={vi.fn()}
      />
    );
    const submit = screen.getByRole('button', { name: /创建/ }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('2. fill view_id + name → submit calls createView + push /scada/[id]/edit', async () => {
    render(
      <NewViewDialog
        open={true}
        projects={[{ project_id: 'p1', name: 'P1' } as any]}
        onClose={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText(/视图 ID/), { target: { value: 'new_v' } });
    fireEvent.change(screen.getByLabelText(/视图名/), { target: { value: '新视图' } });
    fireEvent.click(screen.getByRole('button', { name: /创建/ }));
    await waitFor(() => expect(scada.createView).toHaveBeenCalledTimes(1));
    expect(scada.createView).toHaveBeenCalledWith('p1', expect.objectContaining({
      view_id: 'new_v', name: '新视图',
    }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/scada/new_v/edit'));
  });
});
```

- [ ] **Step 6: NewViewDialog RED**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npm test -- --run NewViewDialog 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 7: Write NewViewDialog**

Create `/Volumes/SSD/BIOCORE/packages/web-ui/src/components/scada/editor/NewViewDialog.tsx`:

```tsx
'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createView, type ScadaProject } from '@/api/scada';

export interface NewViewDialogProps {
  open: boolean;
  projects: ScadaProject[];
  onClose: () => void;
}

export function NewViewDialog({ open, projects, onClose }: NewViewDialogProps) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(projects[0]?.project_id ?? '');
  const [viewId, setViewId] = useState('');
  const [name, setName] = useState('');
  const [reactorId, setReactorId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;
  const canSubmit = projectId && viewId.trim() && name.trim() && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErr(null);
    try {
      const r = await createView(projectId, {
        view_id: viewId.trim(),
        name: name.trim(),
        reactor_id: reactorId.trim() || null,
        width: 800,
        height: 480,
        items: {},
      });
      router.push(`/scada/${r.view_id}/edit`);
    } catch (e: any) {
      setErr(e?.message || 'create_failed');
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'white', padding: 24, borderRadius: 8, minWidth: 420 }}
        className="space-y-3"
      >
        <h2 className="text-lg font-semibold">新建 SCADA 视图</h2>
        <div>
          <label className="block text-sm">项目</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm"
          >
            {projects.map((p) => (
              <option key={p.project_id} value={p.project_id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="nv-id" className="block text-sm">视图 ID</label>
          <input
            id="nv-id"
            type="text"
            value={viewId}
            onChange={(e) => setViewId(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm font-mono"
          />
        </div>
        <div>
          <label htmlFor="nv-name" className="block text-sm">视图名</label>
          <input
            id="nv-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label htmlFor="nv-reactor" className="block text-sm">反应器 (可选)</label>
          <input
            id="nv-reactor"
            type="text"
            value={reactorId}
            onChange={(e) => setReactorId(e.target.value)}
            placeholder="F01"
            className="w-full border rounded px-2 py-1 text-sm"
          />
        </div>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 border rounded text-sm"
            disabled={submitting}
          >取消</button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
          >
            {submitting ? '创建中…' : '创建'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: NewViewDialog GREEN**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npm test -- --run NewViewDialog 2>&1 | tail -10`
Expected: 2/2 PASS.

- [ ] **Step 9: Wire button into index page**

Read `/Volumes/SSD/BIOCORE/packages/web-ui/src/app/scada/page.tsx` first to confirm the current header markup. Then make 3 surgical edits:

(a) Add the dialog import (next to other component imports near the top):

```tsx
import { NewViewDialog } from '@/components/scada/editor/NewViewDialog';
```

(b) Inside `ScadaIndexPage` component body, near other `useState` declarations, add:

```tsx
const [newOpen, setNewOpen] = useState(false);
```

(c) Replace the header block. Find this exact JSX:

```tsx
<div className="flex items-center justify-between">
  <h1 className="text-2xl font-bold">SCADA 工艺画面</h1>
  <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">← 返回 Dashboard</Link>
</div>
```

Replace with:

```tsx
<div className="flex items-center justify-between">
  <h1 className="text-2xl font-bold">SCADA 工艺画面</h1>
  <div className="flex items-center gap-3 text-sm">
    <button
      type="button"
      onClick={() => setNewOpen(true)}
      disabled={projects.length === 0}
      className="px-3 py-1.5 bg-blue-600 text-white rounded disabled:opacity-50"
    >
      + 新建视图
    </button>
    <Link href="/dashboard" className="text-blue-600 hover:underline">← 返回 Dashboard</Link>
  </div>
</div>
```

(d) Add the dialog mount just before the closing `</div>` of the top-level wrapper of the page (after the last `)}` of the conditional table block):

```tsx
<NewViewDialog open={newOpen} projects={projects} onClose={() => setNewOpen(false)} />
```

- [ ] **Step 10: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/components/scada/editor/EditorShell.tsx packages/web-ui/src/components/scada/editor/__tests__/EditorShell.test.tsx packages/web-ui/src/components/scada/editor/NewViewDialog.tsx packages/web-ui/src/components/scada/editor/__tests__/NewViewDialog.test.tsx packages/web-ui/src/app/scada/page.tsx
git commit -m "feat(web-ui): scada editor shell + new-view dialog + index page button (1+2 tests)"
```

---

## Task 12: Edit route page + full suite + TS + browser DoD

**Files:**
- Create: `packages/web-ui/src/app/scada/[viewId]/edit/page.tsx`

- [ ] **Step 1: Create the page**

Create `/Volumes/SSD/BIOCORE/packages/web-ui/src/app/scada/[viewId]/edit/page.tsx`:

```tsx
'use client';
import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchView, type ScadaView } from '@/api/scada';
import { EditorShell } from '@/components/scada/editor/EditorShell';

export default function ScadaEditPage() {
  const params = useParams() as { viewId: string };
  const viewId = params.viewId;
  const router = useRouter();
  const [view, setView] = useState<ScadaView | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('biocore_user');
      if (userStr) {
        try {
          const u = JSON.parse(userStr);
          if (u?.role && !['admin', 'engineer'].includes(u.role)) {
            router.replace(`/scada/${viewId}`);
            return;
          }
        } catch {
          /* malformed JSON — fall through to fetch (server will gate via 401) */
        }
      }
    }
    fetchView(viewId).then(setView).catch((e) => setErr(String(e)));
  }, [viewId, router]);

  if (err) return <div className="p-6 text-red-700">{err}</div>;
  if (!view) return <div className="p-6 text-gray-500">加载中…</div>;
  return <EditorShell view={view} />;
}
```

- [ ] **Step 2: Full test suite (web-ui)**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npm test -- --run 2>&1 | tail -10`
Expected: total = 61 (sub-project 4) + 23 new (1 registry + 4 reducer + 2 palette + 3 canvas + 3 widgetitem + 4 propeditor + 3 bindings + 2 panel + 2 savebar + 1 shell + 2 newview, total 27 from sub-project 5) = ~88 cases; all green.

Note: actual count may vary by ±1 depending on how vitest counts sub-cases; final number must be ≥ 84 and all green.

- [ ] **Step 3: TS compile (web-ui)**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npx tsc --noEmit 2>&1 | grep -E "src/hooks/useEditorState|src/components/scada/editor|src/app/scada|src/api/scada|src/widgets/registry" | head -20`
Expected: no output in sub-project 5 paths. Pre-existing `.next/types/app/scada-demo/...` cache errors from sub-project 3 cleanup are acceptable.

- [ ] **Step 4: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add 'packages/web-ui/src/app/scada/[viewId]/edit/page.tsx'
git commit -m "feat(web-ui): /scada/[viewId]/edit route page (role gate + EditorShell)"
```

- [ ] **Step 5: Browser DoD (manual)**

Start servers if not running:

```bash
cd /Volumes/SSD/BIOCORE/packages/server && nohup npm run dev > /tmp/dod-server.log 2>&1 &
disown
cd /Volumes/SSD/BIOCORE/packages/web-ui && nohup npm run dev > /tmp/dod-web.log 2>&1 &
disown
sleep 20
grep -iE "ready|listening" /tmp/dod-server.log /tmp/dod-web.log
```

Login + verify:

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')
echo "TOKEN_LEN=${#TOKEN}"
```

Manual checks (via playwright MCP or browser):

1. http://localhost:3000/scada → 顶部 "+ 新建视图" 按钮可见 (项目列表非空时启用)
2. 点 "+ 新建视图" → modal 弹出, 填 view_id=`demo_edit_v1`, name=`编辑器测试`, reactor=`F01`, 创建 → 跳 `/scada/demo_edit_v1/edit`
3. 编辑器: 左 palette 8 卡可见; 拖 Tank 卡到画布 → tank widget 出现
4. 点 tank → 选中, 右 panel 显示 罐体 + xy/wh + propsSchema 5 字段 + bindings 区
5. 改颜色 → 画布实时变
6. PropertyPanel 添加 binding `F01.AI-0` → `fillPct` → 实时 tag 值 (若有 active batch)
7. 拖动 tank 位置 → x/y 实时更新, "● 未保存" 显示
8. 右下角蓝 handle 拖动 → 尺寸改
9. 拖 Button widget → 配置 props (text/action/color)
10. 顶部 [保存] → "✓ 已保存", server response 触发 markSaved
11. 跳 `/scada/demo_edit_v1` viewer → 新 widget 渲染 + Button click → WriteIntentDialog
12. 测试 409: 另开 curl `PUT /scada/views/demo_edit_v1 -d '{"background":"#fef3c7"}'` → 编辑器若有 dirty 改 → 保存触发 409 confirm

Cleanup:

```bash
pkill -f "tsx watch.*server" 2>/dev/null
pkill -f "next dev" 2>/dev/null
```

DoD pass criteria:
- 8 widget palette 卡可拖到画布 ✓
- PropertyPanel schema-driven 编辑 props ✓
- BindingsEditor 加/删 binding 工作 ✓
- 拖动 / resize 实时 ✓
- 保存触发 PUT REST + dirty 状态切换 ✓
- 409 confirm 路径触发 ✓
- 跳 viewer 新 items 渲染正确 ✓
- 0 console errors

(No commit for DoD — verification only.)

---

## Self-Review

**1. Spec coverage:**
- §2.1 14 组件 → T1 (registry) + T2 (reducer) + T3 (api) + T4-T10 (8 editor components) + T11 (shell + new-view + index button) + T12 (edit page) ✓
- §3 useEditorState → T2 ✓
- §4 propsSchema + bindableProps → T1 ✓
- §5 拖拽 → T4 (palette dragstart) + T5 (canvas drop) + T6 (widget move/resize handle short-circuit) ✓
- §6 PropertyEditor schema-driven → T7 ✓
- §7 BindingsEditor → T8 ✓
- §8 SaveBar 持久化 + 409 → T10 ✓
- §9 NewViewDialog → T11 ✓
- §10 edit route role gate → T12 ✓
- §11 测试矩阵 (28) → T1+T2+T4+T5+T6+T7+T8+T9+T10+T11 = 1+4+2+3+3+4+3+2+2+(1+2) = 27 (+ existing 1 from sub-project 3 registry test still passing) ✓
- §12 不做项 → 全无在 plan ✓
- §13 风险 → BoundWidget key with bindings.length 在 T5 EditorCanvas; keydown input guard 在 T11 EditorShell; 409 confirm 在 T10 ✓
- §14 DoD → T12 步骤 5 ✓

**2. Placeholder scan:** 无 TBD/TODO/"similar to Task N". 每步都附实代码或具体命令.

**3. Type consistency:**
- `EditorState` + `EditorAction` 在 T2 定义, T9 (PropertyPanel) + T10 (SaveBar) + T11 (EditorShell) 引用 ✓
- `WidgetEntry<P>` 含 `propsSchema` + `bindableProps` 在 T1 注册, T7 (PropertyEditor 接 `PropSchema`), T9 (PropertyPanel 读 entry) ✓
- `updateView` 签名一致 (T3 + T10) ✓
- `createView` 签名一致 (T3 + T11) ✓
- `ScadaView`, `WidgetDef`, `Binding` 均从既有位置 import ✓
- `EditorCanvasProps` 6 callbacks (T5) 匹配 EditorShell 调用 (T11) ✓

**4. 执行注意:**
- T11 索引页修改: 实施时必须先 Read 当前 `app/scada/page.tsx` 确认 header 块完全匹配 step 9(c) 的 old-string. 若有微小差异 (空格 / 标点), 调整 Edit 调用.
- T12 浏览器 DoD 由 controller 执行 (subagent 不动 playwright).
- pnpm 不在 PATH 时使用 `npm test -- --run <pattern>` (sub-project 3-4 已建立).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-15-scada-editor.md`.

User pre-approved Subagent-Driven autonomous execution at sub-project 3 start ("ok, 直到完成, 不再问, 推荐 option") — directive carries through this sub-project. Invoking `superpowers:subagent-driven-development` to execute Tasks 1–12 + final review.
