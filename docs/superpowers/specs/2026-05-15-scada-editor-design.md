# SCADA 编辑器设计 (子项目 5/7)

**Branch:** `feat/scada-data-model`
**Status:** Draft
**Scope:** SCADA viewer 配套编辑器 (拖拽 widget / 工具面板 / properties / save items_json). 仅 admin + engineer 可进。

---

## 1. 上下文

- 子项目 1 已交付: `scada_views` 表 + REST + WS broadcasts + 乐观锁 (`expected_updated_at`).
- 子项目 2 已交付: `useTag` / `useTagHistory` hooks.
- 子项目 3 已交付: 8 widget + `BoundWidget` + `WIDGET_REGISTRY` (每个含 `defaultProps()` + `displayName`).
- 子项目 4 已交付: viewer 路由 + `WidgetView` 画布 + `ViewActionRouter` + 写意图 dialog + WS auto-reload.
- 现存 PUT `/api/v1/scada/views/:viewId` admin/engineer 可写; body 含 `items` + `expected_updated_at` (乐观锁).
- 现存 POST `/api/v1/scada/projects/:projectId/views` admin/engineer 可创建 view。

## 2. 架构

```
/scada/[viewId]/edit  (admin/engineer only — 通过 401/403 拦截)
┌─────────────────────────────────────────────────────────────┐
│ SaveBar: ← back | viewId · dirty? | [取消] [保存]            │
├──────────┬──────────────────────────────────┬───────────────┤
│ Palette  │ EditorCanvas                     │ PropertyPanel │
│ 8 卡     │ (drop zone, 渲染 items absolute, │ (空 / 选中)   │
│ draggable│  点击=选中, 拖动=移动,           │ 选中显示:     │
│          │  右下角 handle=resize)           │  位置/尺寸    │
│          │                                  │  props 表单   │
│          │                                  │  bindings 行  │
└──────────┴──────────────────────────────────┴───────────────┘
```

### 2.1 组件清单

| 文件 | 职责 | 测试 |
|---|---|---|
| `app/scada/[viewId]/edit/page.tsx` | 路由壳: fetch view, 装载 EditorShell | (DoD) |
| `components/scada/editor/EditorShell.tsx` | 3 列布局 + SaveBar | 1 |
| `components/scada/editor/WidgetPalette.tsx` | 8 widget 卡, draggable | 2 |
| `components/scada/editor/EditorCanvas.tsx` | drop zone, 渲染 N×WidgetItem | 3 |
| `components/scada/editor/WidgetItem.tsx` | 单 widget 包装 + outline + handle | 3 |
| `components/scada/editor/PropertyPanel.tsx` | 选中态显隐 | 2 |
| `components/scada/editor/PropertyEditor.tsx` | schema→input 渲染 | 4 |
| `components/scada/editor/BindingsEditor.tsx` | bindings 行增删改 | 3 |
| `components/scada/editor/SaveBar.tsx` | dirty/save/409 | 2 |
| `hooks/useEditorState.ts` | items reducer | 4 |
| `widgets/registry.ts` (修改) | 加 `propsSchema` + `bindableProps` 字段 | (隐式) |
| `api/scada.ts` (修改) | `updateView` + `createView` | (隐式) |
| `app/scada/page.tsx` (修改) | "新建视图" 按钮 + NewViewDialog | 1 (DoD) |
| `components/scada/editor/NewViewDialog.tsx` | 选项目 + view_id + name + reactor_id | 2 |

总测试 ~28 case.

### 2.2 客户端文件结构

```
packages/web-ui/src/
  app/scada/
    page.tsx                          # 修改: 加 "新建视图" 按钮
    [viewId]/
      page.tsx                        # 不动 (sub-project 4)
      edit/page.tsx                   # 新增
  components/scada/
    editor/                           # 新目录
      EditorShell.tsx
      WidgetPalette.tsx
      EditorCanvas.tsx
      WidgetItem.tsx
      PropertyPanel.tsx
      PropertyEditor.tsx
      BindingsEditor.tsx
      SaveBar.tsx
      NewViewDialog.tsx
      __tests__/
        EditorShell.test.tsx          (1)
        WidgetPalette.test.tsx        (2)
        EditorCanvas.test.tsx         (3)
        WidgetItem.test.tsx           (3)
        PropertyPanel.test.tsx        (2)
        PropertyEditor.test.tsx       (4)
        BindingsEditor.test.tsx       (3)
        SaveBar.test.tsx              (2)
        NewViewDialog.test.tsx        (2)
  hooks/
    useEditorState.ts                 # 新增
    __tests__/
      useEditorState.test.ts          (4)
  widgets/
    registry.ts                       # 修改: 8 entry 加 propsSchema + bindableProps
    __tests__/
      registry.test.ts                # 修改: +1 case 验 schema 完整
  api/scada.ts                        # 修改: +updateView +createView
```

server 端**不动**。 sub-project 1 PUT/POST 端点已就位。

依赖: 无新 npm 包。

## 3. 状态机: useEditorState

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
        items: { ...state.items, [action.id]: { ...w, x: action.x, y: action.y } },
        dirty: true,
      };
    }
    case 'resize': {
      const w = state.items[action.id];
      if (!w) return state;
      return {
        ...state,
        items: { ...state.items, [action.id]: { ...w, w: Math.max(40, action.w), h: Math.max(30, action.h) } },
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
        items: { ...state.items, [action.id]: { ...w, bindings: action.bindings.length ? action.bindings : undefined } },
        dirty: true,
      };
    }
    case 'delete': {
      const { [action.id]: _, ...rest } = state.items;
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

测试: 4 case (add 设 dirty + 选中, move 改 xy, delete 移除 + 清选中, markSaved 清 dirty).

## 4. WIDGET_REGISTRY 扩展

`registry.ts` 在每个 entry 加 `propsSchema` (PropertyEditor 渲染输入) + `bindableProps` (BindingsEditor 下拉选项):

```ts
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

// 示例: Tank
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
}
```

8 widget 完整 schema (本文不全列, 实施任务单独详): tank / valve / pump / indicator / trend / label / button / lamp 各有 4-7 prop。

registry.test.ts 新增 case: 每 widget 至少 1 个 propsSchema 项, 至少 1 个 bindableProps (除 label/button — 它们没数据绑定意义)。

## 5. 拖拽数据流

### 5.1 Palette → Canvas (添加)

```
WidgetPalette card 元素 (div draggable=true)
  onDragStart={e => e.dataTransfer.setData('application/x-scada-widget-type', 'tank')}

EditorCanvas 元素 (div)
  onDragOver={e => e.preventDefault()}        // 必须, 否则 drop 不触发
  onDrop={e => {
    const type = e.dataTransfer.getData('application/x-scada-widget-type');
    if (!type) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    const entry = WIDGET_REGISTRY[type];
    if (!entry) return;
    dispatch({type:'add', widget:{
      id: generateWidgetId(type),
      type, x, y, w: 80, h: 80,
      props: entry.defaultProps(),
    }});
  }}
```

### 5.2 Canvas 内拖动 widget

```
WidgetItem 元素 onMouseDown={e => {
  e.stopPropagation();
  if (e.target as HTMLElement matches '[data-handle]') return; // resize, 让 handle 自己处理
  const startX = e.clientX, startY = e.clientY;
  const origX = widget.x, origY = widget.y;
  function onMove(ev: MouseEvent) {
    dispatch({type:'move', id: widget.id, x: origX + (ev.clientX - startX), y: origY + (ev.clientY - startY)});
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  dispatch({type:'select', id: widget.id});
}}
```

### 5.3 Resize (右下角 handle)

```
<div data-handle="se" onMouseDown={e => {
  e.stopPropagation();
  const startX = e.clientX, startY = e.clientY;
  const origW = widget.w, origH = widget.h;
  function onMove(ev: MouseEvent) {
    dispatch({type:'resize', id: widget.id,
      w: origW + (ev.clientX - startX),
      h: origH + (ev.clientY - startY)});
  }
  function onUp() { /* same cleanup */ }
  ...
}} style={{position:'absolute', right:-4, bottom:-4, width:10, height:10, background:'#3b82f6', cursor:'se-resize'}} />
```

### 5.4 选中 / 取消选中

- Canvas 空白 mousedown → `dispatch({type:'select', id: null})`
- WidgetItem mousedown → `dispatch({type:'select', id})`
- ESC 键 → deselect

### 5.5 删除选中

- Delete / Backspace → 当 selectedId !== null → `dispatch({type:'delete', id: selectedId})`

但: PropertyEditor 内 input 也用 Delete/Backspace 删字符. 全局 keydown 应仅在没有 focused input 时触发. 实现:

```ts
function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement;
  if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
  if (e.key === 'Escape') dispatch({type:'select', id: null});
  else if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId) {
    dispatch({type:'delete', id: state.selectedId});
  } else if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    save();
  }
}
```

## 6. PropertyEditor (schema-driven)

```tsx
function renderInput(key: string, schema: PropSchema, value: any, onChange: (v: any) => void) {
  switch (schema.type) {
    case 'number':
      return <input type="number" value={value ?? ''} min={schema.min} max={schema.max} step={schema.step ?? 1}
        onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />;
    case 'string':
      return <input type="text" value={value ?? ''} onChange={e => onChange(e.target.value)} />;
    case 'textarea':
      return <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} />;
    case 'color':
      return <input type="color" value={value ?? '#000000'} onChange={e => onChange(e.target.value)} />;
    case 'boolean':
      return <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />;
    case 'select':
      return <select value={value ?? ''} onChange={e => onChange(e.target.value)}>
        {(schema.options ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>;
  }
}
```

PropertyPanel 拿到 selected widget + 它的 `propsSchema`, 遍历 schema 渲染 N 个 input + 显示当前值, onChange → `dispatch({type:'updateProps', id, patch:{[key]:newValue}})`. 简单, 通用, 8 widget 零重复。

测试 4 case: number / string / color / select 各 1。

## 7. BindingsEditor

```
[+ 添加绑定]
┌─ binding 1 ────────────────────────────────────────────────┐
│ 绑定字段: [▼ fillPct (来自 bindableProps)]                  │
│ Tag:     [F01.AI-0      ]                                   │
│ 变换:    [Math.min(100, v/50*100)    ] (textarea, 可空)    │
│                                                  [删除]     │
└────────────────────────────────────────────────────────────┘
```

Action: 每行 onChange → 合成 `Binding[]` 全集 → `dispatch({type:'setBindings', id, bindings})`. 删除一行 → 同样.

3 测试: 加 1 行 / 删 1 行 / 改 transform.

## 8. SaveBar 持久化

```tsx
function SaveBar({ state, viewId, dispatch }) {
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await updateView(viewId, {
        items: state.items,
        expected_updated_at: state.baselineUpdatedAt,
      });
      dispatch({ type: 'markSaved', updated_at: r.updated_at });
      toast.success('已保存');
    } catch (e: any) {
      if (e.message === 'concurrent_update') {
        if (confirm('其他人改了视图. 重新加载会丢失本次编辑. 继续?')) {
          const fresh = await fetchView(viewId);
          dispatch({ type: 'loadFromServer', view: fresh });
        }
      } else { toast.error(e.message); }
    } finally { setSaving(false); }
  };
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">{state.dirty ? '● 未保存' : '✓ 已保存'}</span>
      <button disabled={!state.dirty || saving} onClick={handleSave}>
        {saving ? '保存中…' : '保存'}
      </button>
    </div>
  );
}
```

`updateView` (新, in `api/scada.ts`):

```ts
export async function updateView(
  viewId: string,
  body: { items?: Record<string, any>; expected_updated_at?: string; name?: string; reactor_id?: string | null; width?: number; height?: number; background?: string; },
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
  body: { view_id: string; name: string; reactor_id?: string | null; width?: number; height?: number; background?: string; items?: Record<string, any>; },
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

注: 401 响应被 sub-project 4 现有 useAudit / apiFetch 重试逻辑覆盖 (本子项目不重发明). 但本子项目 fetch 直接调, 不走 apiFetch; 简单实现, role 决定能否进编辑器 (页 mount 时若 user.role 不在 admin/engineer → 显 403 提示).

## 9. NewViewDialog (索引页弹框)

```
[+ 新建视图] (顶部按钮)
  → modal:
    项目: [▼ Demo SCADA, ...]
    视图 ID: [demo_v2_____]
    视图名: [F01 主画面___]
    反应器 (可选): [▼ F01 / F02 / F03 / F04 / (无)]
  [取消] [创建]
```

提交: `createView(projectId, { view_id, name, reactor_id, width: 800, height: 480, items: {} })` → 成功 → push `/scada/[view_id]/edit`.

2 测试: 字段必填校验 + 提交触发 createView.

## 10. 编辑器路由 `/scada/[viewId]/edit/page.tsx`

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchView, type ScadaView } from '@/api/scada';
import { EditorShell } from '@/components/scada/editor/EditorShell';

export default function ScadaEditPage() {
  const { viewId } = useParams() as { viewId: string };
  const router = useRouter();
  const [view, setView] = useState<ScadaView | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // role gate: 读 localStorage.biocore_user; 不在 admin/engineer → 跳查看页
  useEffect(() => {
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('biocore_user') : null;
    if (userStr) {
      const u = JSON.parse(userStr);
      if (!['admin', 'engineer'].includes(u.role)) {
        router.replace(`/scada/${viewId}`);
        return;
      }
    }
    fetchView(viewId).then(setView).catch(e => setErr(String(e)));
  }, [viewId]);

  if (err) return <div className="p-6 text-red-700">{err}</div>;
  if (!view) return <div className="p-6 text-gray-500">加载中…</div>;
  return <EditorShell view={view} />;
}
```

注: client-side role gate 是 UX 引导. 真正授权在 server PUT/POST 端点 (`requireRole('admin','engineer')`). 客户端旁路不能写入。

## 11. 测试矩阵 (~28)

| 文件 | Case | 描述 |
|---|---|---|
| useEditorState.test | 1 | add 加 widget + 设 dirty + 自动 select |
| | 2 | move 改 x/y + 保留其他 prop |
| | 3 | delete 移除 + 清 selectedId |
| | 4 | markSaved 清 dirty + 更新 baselineUpdatedAt |
| WidgetPalette.test | 1 | 渲染 8 卡 (8 displayName) |
| | 2 | dragstart 设 dataTransfer mime |
| EditorCanvas.test | 1 | drop event → onAdd called with type + xy |
| | 2 | items render via stub WidgetItem |
| | 3 | 空白 mousedown → dispatch select null |
| WidgetItem.test | 1 | 非选中: 不显 outline / handle |
| | 2 | 选中: 显 outline + handle, mousedown 触发 select |
| | 3 | handle mousedown 不触发 widget select (data-handle) |
| PropertyPanel.test | 1 | 无 selectedId → "未选中" 空态 |
| | 2 | selectedId 存在 → 显 widget displayName + bindings rows |
| PropertyEditor.test | 1 | number schema → input type=number + onChange dispatch updateProps |
| | 2 | string → text input |
| | 3 | color → color input |
| | 4 | select → dropdown options |
| BindingsEditor.test | 1 | "添加" 按钮 → setBindings 含新行 |
| | 2 | "删除" → setBindings 减一 |
| | 3 | transform 输入变化 → setBindings 含新 transform |
| SaveBar.test | 1 | dirty=false → 按钮 disabled |
| | 2 | 点 save → updateView 调用 + markSaved dispatch |
| EditorShell.test | 1 | 渲染 3 列布局 + SaveBar |
| NewViewDialog.test | 1 | view_id 空 → 提交 disabled |
| | 2 | 全填 + 提交 → createView 调 + push 路由 |
| registry.test | (+1) | 8 widget 每个含 propsSchema 至少 1 字段 |

Mock 策略:
- `WidgetItem.test`: stub BoundWidget (`vi.mock('@/widgets', () => ({BoundWidget: () => <div/>}))`)
- `EditorCanvas.test`: stub WidgetItem 输出 data attrs
- `PropertyEditor.test`: stub registry 只放 1 widget 的 schema
- `SaveBar.test`: stub `@/api/scada.updateView`
- `NewViewDialog.test`: stub `@/api/scada.createView` + `next/navigation.useRouter`

## 12. 不做的事 (定界)

- Undo / redo
- Multi-select / 框选
- Copy-paste / duplicate
- Grid snap / 标尺 / 对齐线
- Zoom / pan / fit-to-screen
- 锁定 / 分组 / z-index 层级 UI
- 自动保存
- 多人协同 (OT / CRDT)
- 自定义 widget 注册机制
- 主题切换 / 响应式 / 移动端
- 项目新建 UI (用现有 REST 直建)
- Recipe / batch 选择器 (不属编辑器)
- WS 协同提示 (其他人编辑中的标记)

## 13. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| BoundWidget 内置 useTag 在编辑模式频繁 re-render 干扰 drag | 卡顿 | bindings 数量不变时 React.memo 比较 props 即可; 不动 WidgetItem 外层 mousedown |
| Hook rules: 改 bindings 数 → useTag 数量变 | crash | WidgetItem 内 BoundWidget key 含 bindings.length, remount |
| 全局 keydown 误触 (input 中按 Delete) | 数据丢 | onKey 内首先检查 e.target 是 INPUT/TEXTAREA |
| 乐观锁 409 | 编辑丢失 | confirm 让用户确认重载, 不强制 |
| items 序列化 size 超 SCADA_ITEMS_MAX_BYTES | save 400 | 服务端已限; client 仅 try/catch err.message 显示 |
| client-side role gate 旁路 | viewer 改不了 (server 拒) | 真正控权在 PUT 端点 requireRole; client 仅 UX 引导 |
| drag 跨 widget 重叠点击 | 选错 | mousedown 仅最上层 widget 收到 (z-index by document order); stopPropagation 阻冒泡 |

## 14. 验收 (DoD)

- 28 vitest cases 全绿 (sub-project 4 61 + sub-project 5 28 = 89+; registry +1 = 90+)
- TS 编译 0 新错误
- 浏览器 DoD:
  1. 登录 admin → `/scada` 索引 → 点 "+ 新建视图" → 填表 → 提交 → 跳 `/scada/[new_id]/edit`
  2. 编辑器: 拖 Tank 卡到画布 → 显示罐 widget
  3. 选中 Tank → PropertyPanel 显当前 props → 改颜色 → 画布实时变
  4. 加 binding `F01.AI-0` → `fillPct` → 实时 tag 显示 (若有 active batch + tag 流)
  5. 拖动罐位置 → x/y 实时更新
  6. 右下角 handle 拖动 → 尺寸改
  7. 拖 Button widget 进画布 → 配置 action `open_suggest_dialog` payload tag/value
  8. 顶部 "● 未保存" → 点 [保存] → "✓ 已保存"
  9. 跳 `/scada/[id]` viewer → 新 widget 正确渲染 + Button 触发 dialog
  10. (并发测试) 在另一窗口手工 PUT view → 编辑窗口若有 dirty 改, 保存触发 409 confirm

---

## 15. 实施顺序 (~12 任务)

1. registry.ts 扩 propsSchema + bindableProps + test 案
2. useEditorState reducer + 4 测试
3. api/scada.ts +updateView +createView (无独立测, 后续 mocked)
4. WidgetPalette + 2 测试
5. EditorCanvas + 3 测试
6. WidgetItem + 3 测试
7. PropertyEditor + 4 测试
8. BindingsEditor + 3 测试
9. PropertyPanel + 2 测试
10. SaveBar + 2 测试
11. EditorShell + 1 测试
12. NewViewDialog + 2 测试 + 索引页加按钮
13. 编辑器 route page + 全 suite + TS
14. 浏览器 DoD + 最终 review

(实际可合并为 ~11 task; writing-plans 阶段定 final 顺序)
