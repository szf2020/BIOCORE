# SP-FX-2 Services + Dialogs 设计 (FUXA SCADA 移植子项目 2/8)

**Status:** Draft, awaiting user review
**Date:** 2026-05-17
**Parent spec:** `docs/superpowers/specs/2026-05-17-fuxa-scada-port-design.md`
**Predecessor:** SP-FX-1 (commit 7a2103c, main) — assets + models + backend schema + REST CRUD + api client
**Budget:** 1 week, web-ui +75 tests (390 → ~465)

---

## 1. Architecture

### 1.1 范围

SP-FX-2 交付 4 个 service + 4 个 dialog, 全部在 `packages/web-ui/src/scada-engine/`:

```
scada-engine/
├── services/                          ← SP-FX-2 新建
│   ├── tag-binding.ts                 ~120 行 (useTag 包装 + writeTag)
│   ├── tag-binding.test.ts            10 测试
│   ├── editor-store.ts                ~220 行 (zustand: view+dirty+undo+selection)
│   ├── editor-store.test.ts           18 测试
│   ├── expression-eval.ts             ~120 行 (expr-eval 包装)
│   ├── expression-eval.test.ts        14 测试
│   ├── selection.ts                   ~50 行 (helpers, editorStore 调用)
│   └── selection.test.ts              8 测试
│
├── dialogs/                           ← SP-FX-2 新建
│   ├── ConfirmDialog.tsx              ~60 行
│   ├── ConfirmDialog.test.tsx         5
│   ├── SectionMessageDialog.tsx       ~70 行
│   ├── SectionMessageDialog.test.tsx  4
│   ├── ViewPropertyDialog.tsx         ~120 行 (zod form)
│   ├── ViewPropertyDialog.test.tsx    6
│   ├── FileUploadDialog.tsx           ~100 行
│   ├── FileUploadDialog.test.tsx      5
│   └── index.ts                       (barrel)
│
└── index.ts                           ← 修改: re-export services/* + dialogs/*
```

### 1.2 安全约束 (CRITICAL)

**约束 1 (read-only path):**
> 自动逻辑 / 动画 / 表达式求值器 (expression-eval) 永不直写 PLC。
> expression-eval 是 read-only, 输入 `tagValues` 输出值, 编码层面隔离, 不引用 writeTag。

**约束 2 (operator manual path):**
> Operator 手动 set-value 通过 client WS → server 中转 → plc-driver。
> SP-FX-2 client 实现 `writeTag(tagId, value, { confirmed })` 发送 `{type:'set-value', tagId, value, reqId}` WS 消息。
> Server 必须验权 (operator+ 角色) + 写 audit log + 转发到 plc-driver — server WS 'set-value' handler 实现属于 SP-FX-7。

**约束 3 (confirm UX):**
> 每个 FuxaEvent 带 `requireConfirm?: boolean = true` (zod optional default true)。
> 默认所有 set-value 弹 ConfirmDialog。Designer 可在 view-property 编辑器里选择性关闭。

### 1.3 测试基线

| 包 | 前 | 后 | 增量 |
|----|----|----|----|
| web-ui | 390 | **~465** | +75 (services 50 + dialogs 20 + 集成 5) |
| server | 147 | 147 | 0 (SP-FX-2 不动 server) |
| data-service | 84 | 84 | 0 |

覆盖率: services ≥ 90%, dialogs ≥ 80% (per parent spec §9).

### 1.4 依赖

新增 npm 依赖:
- `expr-eval` ^2.0.2 (~10KB, MIT) — 表达式求值, no member access, no function definition, 注入白名单函数

复用现有依赖 (无需新增):
- `zustand` — editor-store
- `@radix-ui/react-dialog` — dialog primitives (项目已用于其他 modal)
- `zod` — ViewPropertyDialog 表单校验
- `react-testing-library` + `vitest` + `jsdom` — 测试 (SP3 已配)

---

## 2. Components

### 2.1 `tag-binding.ts` — 单文件 service (~120 行)

```ts
// scada-engine/services/tag-binding.ts
import { useTag } from '@/hooks';
import { wsConnection } from '@/lib/ws-singleton';
import { useRealtimeStore } from '@/stores/realtime-store';

export interface TagSnapshot {
  value: number | string | boolean | null;
  isStale: boolean;
  ageMs: number;
}

export interface WriteOpts {
  confirmed?: boolean;
  reason?: string;
  timeoutMs?: number; // default 3000
}

// React-side: widget 用这个 hook 订阅
export function useTagBinding(tagId: string, opts?: { staleMs?: number }): TagSnapshot {
  return useTag(tagId, opts);
}

// Imperative: 给非 React 上下文 (e.g. svg.js DOM 操作内) 用
export function readTagSnapshot(tagId: string): TagSnapshot {
  const s = useRealtimeStore.getState();
  // ... 直读 store, 不订阅
}

// Operator 手动写入
export async function writeTag(
  tagId: string,
  value: number | string | boolean,
  opts: WriteOpts = {},
): Promise<void> {
  if (!opts.confirmed) {
    throw new Error('writeTag requires explicit confirmation (opts.confirmed=true)');
  }
  const reqId = crypto.randomUUID();
  const timeoutMs = opts.timeoutMs ?? 3000;
  // send + await ack with timeout
  // server 端 SP-FX-7 实现 ack 协议
}
```

### 2.2 `editor-store.ts` — zustand (~220 行)

```ts
import { create } from 'zustand';
import type { FuxaView, FuxaWidget } from '../models/hmi';
import { produce } from 'immer';

const HISTORY_LIMIT = 50;

export interface EditorState {
  currentView: FuxaView | null;
  isDirty: boolean;
  history: { past: FuxaView[]; future: FuxaView[] };
  selection: string[]; // widget ids
  // actions
  openView: (view: FuxaView) => void;
  closeView: () => void;
  updateWidget: (id: string, patch: Partial<FuxaWidget>) => void;
  deleteWidgets: (ids: string[]) => void;
  addWidget: (widget: FuxaWidget) => void;
  undo: () => void;
  redo: () => void;
  setSelection: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  clearSelection: () => void;
  markClean: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  // 实现见 implementation plan
}));
```

History 存 patch 而非整 view snapshot, 用 immer 生成 patch 节省内存。

### 2.3 `expression-eval.ts` — expr-eval 包装 (~120 行)

```ts
import { Parser } from 'expr-eval';

const parser = new Parser({
  operators: { logical: true, comparison: true, conditional: true },
  allowMemberAccess: false, // 禁止 obj.prop 访问, 防原型污染
});

// 白名单函数
const SAFE_FNS = {
  IF: (cond: boolean, a: unknown, b: unknown) => cond ? a : b,
  MIN: Math.min,
  MAX: Math.max,
  ABS: Math.abs,
  ROUND: (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d,
};

const MAX_EXPR_LENGTH = 500;
const parseCache = new Map<string, ReturnType<typeof parser.parse>>();

export function evalExpression(
  expr: string,
  tagValues: Record<string, number | string | boolean>,
): unknown {
  if (!expr || expr.length > MAX_EXPR_LENGTH) return undefined;
  try {
    let parsed = parseCache.get(expr);
    if (!parsed) {
      parsed = parser.parse(expr);
      parseCache.set(expr, parsed);
    }
    return parsed.evaluate({ ...SAFE_FNS, ...tagValues });
  } catch (e) {
    console.warn(`expression eval failed: ${expr}`, (e as Error).message);
    return undefined;
  }
}

export function parseTagsFromExpression(expr: string): string[] {
  try {
    return parser.parse(expr).variables({ withMembers: false })
      .filter(v => !(v in SAFE_FNS));
  } catch {
    return [];
  }
}
```

### 2.4 `selection.ts` — helpers (~50 行)

```ts
export interface Rect { x: number; y: number; w: number; h: number; }

export function boxIntersects(box: Rect, widget: { x: number; y: number; w: number; h: number }): boolean {
  return !(widget.x + widget.w < box.x ||
           widget.x > box.x + box.w ||
           widget.y + widget.h < box.y ||
           widget.y > box.y + box.h);
}

export function diffSelection(prev: string[], next: string[]): { added: string[]; removed: string[] } {
  const prevSet = new Set(prev);
  const nextSet = new Set(next);
  return {
    added: next.filter(id => !prevSet.has(id)),
    removed: prev.filter(id => !nextSet.has(id)),
  };
}
```

### 2.5 Dialogs (4 个 .tsx)

所有 dialogs 基于 Radix `@radix-ui/react-dialog`, portal 挂 document.body, z-index ≥ 9999。

**ConfirmDialog:**
```tsx
interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;    // default '确认'
  cancelLabel?: string;     // default '取消'
  danger?: boolean;         // 红色 confirm 按钮
  onConfirm: () => void;
  onCancel?: () => void;
}
```

**SectionMessageDialog:**
```tsx
interface Props {
  open: boolean;
  level: 'info' | 'warn' | 'error';
  title: string;
  message: string;
  onClose: () => void;
}
```

**ViewPropertyDialog:**
```tsx
interface ViewPropertyPatch {
  name: string;
  width: number;
  height: number;
  background_color?: string;
}
const ViewPropertyPatchSchema = z.object({
  name: z.string().min(1, '视图名称必填'),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  background_color: z.string().optional(),
});
interface Props {
  open: boolean;
  view: FuxaView;
  onSave: (patch: ViewPropertyPatch) => void;
  onCancel: () => void;
}
```

**FileUploadDialog:**
```tsx
interface Props {
  open: boolean;
  accept?: string;           // e.g. '.svg,.json'
  multiple?: boolean;
  maxSizeBytes?: number;     // default 10*1024*1024
  onUpload: (files: File[]) => Promise<void>;
  onCancel: () => void;
}
```

### 2.6 Patch SP-FX-1 model

修改 `packages/web-ui/src/scada-engine/models/property.ts` 的 `FuxaEventSchema`, 加可选字段:

```ts
export const FuxaEventSchema = z.object({
  type: z.enum([...]),
  action: z.enum([...]),
  actparam: z.string(),
  actoptions: z.record(z.any()).optional(),
  requireConfirm: z.boolean().optional().default(true), // ← 新增
});
```

向后兼容 (旧 JSON 缺字段自动填 true), 不升 `schemaVersion`。

---

## 3. Data Flow

### 3.1 Tag read 流 (widget 显示实时值)

```
PLC → plc-driver (snap7/modbus) → server pv_realtime → MQTT publish → server WS broadcast
   ↓
client WS receive → realtime-store._tick++ → useTag (zustand selector)
   ↓
useTagBinding(tagId) → {value, isStale, ageMs}
   ↓
React widget rerender
```

### 3.2 Tag write 流 (operator 手动)

```
operator click button → widget onClick handler
   ↓
读 FuxaEvent.requireConfirm (default true)
   ├── true  → ConfirmDialog 弹出 → user 确认
   └── false → 直接下一步
   ↓
writeTag(tagId, value, { confirmed: true, reason })
   ↓
wsConnection.send({ type:'set-value', tagId, value, reason, reqId, ts })
   ↓
[server WS handler — SP-FX-7 实现]
   ├── authMiddleware 验 user role (operator+)
   ├── audit log insert
   └── plc-driver.write(tagId, value)
   ↓
server WS send {type:'set-value-ack', reqId, ok, error?}
   ↓
client writeTag 解 promise (3s timeout)
```

### 3.3 Editor save 流

```
designer drag/drop/edit → editorStore.updateWidget(id, patch)
   ↓
history.past.push(prevView) + isDirty=true + history.future=[]
   ↓
[Ctrl+S 或 toolbar Save]
   ↓
api/fuxa-views.ts: updateFuxaView(id, { expectedVersion, ...view })
   ├── 200 → editorStore.markClean() + toast "已保存"
   ├── 409 → SectionMessageDialog "版本冲突, 当前 v=X. 重新加载?"
   └── 400/500 → SectionMessageDialog 错误信息
```

### 3.4 Expression eval 流 (animation)

```
view load → 遍历 widgets.actions → 每个 action.actparam (expression)
   ↓
parseTagsFromExpression(expr) → tagIds[]
   ↓
React widget mount → for each tagId: useTagBinding(tagId)
   ↓
每个 useTag 值变 → 收集 tagValues 对象
   ↓
evalExpression(expr, tagValues) → 结果 (number/bool/string)
   ↓
apply 到 widget DOM (visibility/opacity/rotate/color/text)
```

### 3.5 Selection 流 (multi-select)

```
canvas mousedown → 命中检测
   ├── 命中 widget → editorStore.setSelection([id])
   ├── 命中 widget + Shift → editorStore.addToSelection(id)
   └── 命中空白 → 进入 box-select 模式
   ↓
mousemove → 画选框 (canvas SVG 层渲染, SP-FX-3)
   ↓
mouseup → boxIntersects 求交 → setSelection(matchedIds)
   ↓
editorStore.selection 变化 → 多 widget 边框 highlight (SP-FX-6 CSS)
```

---

## 4. Error Handling

### 4.1 tag-binding

| 场景 | 处理 |
|------|------|
| WS 断开 | useTag 返 `{value: lastKnown, isStale: true}`, widget 上层 (SP-FX-6) 显示灰边框 + tooltip |
| tagId 不存在 | 返 `{value: null, isStale: true, ageMs: Infinity}`, widget 显 "—" |
| writeTag 未 confirm | 抛 `Error('writeTag requires explicit confirmation')` (dev assertion) |
| writeTag WS 发送失败 | promise reject + SectionMessageDialog "下发失败: 网络断开" |
| writeTag ack 超时 (>timeoutMs) | promise reject + SectionMessageDialog "PLC 写入超时" |
| writeTag ack `ok:false` | promise reject 携带 server error message + 对应 dialog |

### 4.2 editor-store

| 场景 | 处理 |
|------|------|
| openView 失败 (API 404) | currentView=null, 上层路由 redirect |
| updateWidget 时 currentView=null | dev assertion error |
| history.past 超 50 | shift 最旧 |
| undo 时 past 空 | no-op |
| save 409 | store 不变, 弹 SectionMessageDialog 让 user reload 或 force |

### 4.3 expression-eval

| 场景 | 处理 |
|------|------|
| 语法错 | 返 undefined, 一次性 console.warn (per-expr-per-session, parseCache 去重) |
| 除零 / NaN | 返 NaN, animation 层降级 (隐藏 widget 或原色) |
| tag 缺失 | 当 0, 一次性 console.warn |
| 长度 > 500 | 拒绝, 返 undefined + 安全告警 |
| 求值 > 50ms | console.warn 性能告警 (不阻断) |

**关键: expression-eval 永不抛异常到 React 树**, 否则 widget rerender 整张图崩。

### 4.4 Dialogs

| 场景 | 处理 |
|------|------|
| onCancel 未传 | no-op (optional) |
| ViewPropertyDialog zod 失败 | inline 红字, Save 禁用 |
| FileUploadDialog 文件 > maxSizeBytes | inline 错误, 不发起上传 |
| FileUploadDialog 上传中断网 | 显错误, 保留 dialog, 让 user 重试 |

### 4.5 Selection

`setSelection(ids)` filter 掉 currentView.items 中不存在的 id, 防 stale 引用。

---

## 5. Testing

### 5.1 测试分布

| 文件 | 测试数 | 覆盖 |
|------|--------|------|
| `tag-binding.test.ts` | 10 | useTagBinding 等价 useTag / readTagSnapshot 直读 / writeTag 强制 confirmed / WS send 内容 / WS 断开 / ack 超时 reject / ack ok:false reject |
| `editor-store.test.ts` | 18 | openView / updateWidget+dirty / undo+redo / history 50 上限 / selection set/add/clear/remove / save 后 markClean / 多 widget 删除 / addWidget |
| `expression-eval.test.ts` | 14 | 算术 / 比较 / 逻辑 / IF MIN MAX ABS ROUND / 缺失 tag 当 0 / 语法错返 undefined / 长度 >500 拒绝 / parseTagsFromExpression / 无 member access (`obj.foo` 报错) / parseCache 命中 |
| `selection.test.ts` | 8 | boxIntersects 4 case / diffSelection added+removed / filter stale ids / 边界 case |
| `ConfirmDialog.test.tsx` | 5 | 渲染 title+message / confirm 触发 / cancel 触发 / danger 样式 / open=false 不渲染 |
| `SectionMessageDialog.test.tsx` | 4 | 三 level 样式 / 点关闭触发 onClose / 渲染 title+message |
| `ViewPropertyDialog.test.tsx` | 6 | zod 校验 (name/width/height) / Save disabled+enabled / onSave 传 patch / Cancel 不调 onSave / 初始值填充 |
| `FileUploadDialog.test.tsx` | 5 | 选文件触发 onUpload / 上传中显进度 / 错误显信息 / >maxSize 拒绝 / multiple 接收多文件 |
| **集成** `tag-binding.integration.test.tsx` | 5 | 含 useTagBinding 组件 / mock store push tick / 值更新 rerender / isStale 切换 / 多 hook 协同 |

**合计 75 测试.**

### 5.2 测试基础

复用 SP3 已装:
- vitest + jsdom + @testing-library/react
- realtime-store mocking 模式

新增:
- `src/test/wsMock.ts` — `mockWsConnection({onSend, queueAck})` helper, 控制 ack 时序
- `src/test/exprFixtures.ts` — 50+ valid + 20 invalid 表达式样本

### 5.3 TDD

每 task RED-first:
1. 写测试文件
2. `pnpm exec vitest run <file>` 确认 RED
3. 写最小实现 → GREEN
4. refactor
5. commit

每 component 单独 commit。

### 5.4 集成 + tsc

- 每 task 后跑 `vitest run` 该文件
- 每 task 后跑 `tsc --noEmit` (web-ui)
- 全 task 完跑 `vitest run` 整 web-ui 包防回归
- E2E 不跑 (留 SP-FX-8)

### 5.5 覆盖率

services ≥ 90%, dialogs ≥ 80%. CI `vitest run --coverage` 验阈值。

---

## 6. Risks + Stop Conditions

### 6.1 Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----|--------|------|
| R1 | expr-eval 不支持某些 FUXA 历史表达式 | Med | 部分 widget 动画失效 | T7 step 1 跑 50+ FUXA 表达式样本, 不支持的留 SP-FX-7 fallback |
| R2 | WS set-value-ack 协议要 server 配合, SP-FX-7 前无法端到端测 | High | client 集成测试只能 mock ack | 接受: SP-FX-2 用 wsMock 注入 ack |
| R3 | editorStore history 50 上限对大 view 内存压力 | Low | undo 慢 | history 存 patch (immer) 而非 snapshot |
| R4 | useTag 1Hz 节流, 多 tag 表达式跨多 rerender | Med | 短暂错误中间值 | 放 SP-FX-7 优化 (useDeferredValue 或 batch) |
| R5 | Radix Dialog 与 SCADA canvas z-index 冲突 | Low | dialog 被盖 | portal 挂 body, z-index ≥ 9999 |
| R6 | ConfirmDialog 嵌套 ViewPropertyDialog | Med | 焦点跳乱 | Radix 原生支持 nested, 集成测试覆盖 |
| R7 | FileUploadDialog 5MB 对 SVG 不够 | Low | import 失败 | 提到 10MB, 加 server 真校验 |
| R8 | expression-eval 求值耗时累积 (100 widget × 5 expr × 1Hz = 500/s) | Med | UI 卡 | parseCache 复用 parsed AST, 每 expr parse 一次 |
| R9 | requireConfirm 加字段升级路径 | Low | 旧 view 缺字段 | zod `.optional().default(true)` 兼容 |

### 6.2 Stop Conditions

满足任一停止并升级人:

1. **R1 不支持率 > 30%** (50 样本超 15 个挂) → 切自写 evaluator (option C 多 2-3 天) 或缩小语法
2. **R2 WS 'set-value' 路径与现有 ws-server.ts 架构冲突** → 暂改 REST POST /api/v1/set-value
3. **R3 undo 单次 > 2s** (patch 实现错误) → 重新设计 history 结构
4. **测试基础不足** (web-ui vitest+jsdom 未跑过 dialog 类组件) → T1 先验证基础设施

### 6.3 不在 SP-FX-2 范围 (defer)

- server WS 'set-value' handler 实现 → SP-FX-7
- 表达式 fallback / 自写 evaluator → SP-FX-7 (R1 触发时)
- expression-eval 性能优化 → SP-FX-7
- treetable / property-edit dialog → SP-FX-5
- selection rubber-band 视觉 (虚线框 SVG) → SP-FX-3
- 真实操作员权限模型 / audit log → SP-FX-7
- editor undo 支持 selection 恢复 → 可加 (低成本, 实现 plan 决定)

---

## 7. 接受标准 (acceptance)

SP-FX-2 完成定义:

- [ ] 4 services + 4 dialogs 全部实现 + tests GREEN
- [ ] web-ui vitest 全包 GREEN (≥ 465 测试)
- [ ] `tsc --noEmit` clean (web-ui)
- [ ] services 覆盖率 ≥ 90%, dialogs ≥ 80%
- [ ] FuxaEventSchema patched (requireConfirm 字段), 不破坏 SP-FX-1 hmi.test.ts 13/13
- [ ] expr-eval 跑通 50+ FUXA 表达式样本, 不通过率 < 30% (否则触发 stop condition 1)
- [ ] Push 到 origin/main, commits 原子 + 每 commit 测试绿
- [ ] 最终 code reviewer 通过

---

## 8. 后续 SP-FX 链路

- SP-FX-3 (editor canvas): 用 editor-store 的 selection / undo / updateWidget
- SP-FX-4 (editor shell): 用 ViewPropertyDialog + ConfirmDialog
- SP-FX-5 (shapes + 余下 dialogs): 用 FileUploadDialog import SVG
- SP-FX-6 (widgets): 用 useTagBinding + expression-eval + writeTag
- SP-FX-7 (runtime): 实现 server WS 'set-value' handler + ack 协议; expression-eval 性能优化
