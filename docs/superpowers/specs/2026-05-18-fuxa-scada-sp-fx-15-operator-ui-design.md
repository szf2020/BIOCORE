# SP-FX-15 Operator UI 嵌 Runtime — Design Spec

**Date**: 2026-05-18  
**Sprint**: SP-FX-15  
**Author**: agent-B (operator-ui)

---

## 1. 背景与目标

SP-FX-7 #5 deferred: 独立 `/scada2/suggestions` 页已 ship，操作员需要切换页面才能 accept/reject AI 建议。本 sprint 把 accept/reject UI 内嵌进 runtime view-v2，令操作员无需离开当前 view 即可处理 pending suggestions。

目标：
1. 新建 `SuggestionsBar` 组件 — 浮于 runtime view 底部可收折的 bar
2. 嵌入 RuntimeShell，按 viewId 过滤相关 suggestions
3. 不重复 WriteIntentDialog 链路 (AI suggestion accept → server dispatcher → PLC，人工写操作保持原流程)

---

## 2. 范围

### 新增文件
- `packages/web-ui/src/components/scada/runtime/SuggestionsBar.tsx`
- `packages/web-ui/src/components/scada/runtime/__tests__/SuggestionsBar.test.tsx`
- `packages/web-ui/e2e/scada-operator-ui.spec.ts`

### 修改文件
- `packages/web-ui/src/scada-engine/runtime/RuntimeShell.tsx` — 末尾渲染 `<SuggestionsBar />`

### 不动文件
- RuntimeCanvas、animation-engine、gauge-registry、batch2 widgets、server、data-service

---

## 3. 数据拉取策略

选择 **客户端 5s 轮询 (poll)**，理由：
- SSE 是 SP-FX-16 scope，不提前依赖
- `useScadaSuggestions` hook 已有 realtime-store 触发式 refetch；SuggestionsBar 做轻量独立 hook
- 5s 间隔对 operator review 场景足够
- 新建 `useSuggestionsBar` hook 独立管理生命周期，避免状态耦合

---

## 4. 过滤策略

现有 API `GET /api/v1/ai/suggestions?status=pending&source_module=scada` 不支持 viewId filter。

`ScadaSuggestion.reasoning` 字段存 JSON `{ view_id, widget_id, reason, value }`（SuggestionRow 已解析）。

**客户端过滤**：
- 若 reasoning 解析出 `view_id === viewId` → 显示
- 若 reasoning 无 view_id（来源不明）→ 也显示（宽松策略，不遗漏）
- `reactorId` 暂不过滤（suggestions 仅含 view_id）

---

## 5. SuggestionsBar 组件设计

### Props

```typescript
interface SuggestionsBarProps {
  viewId: string;
  reactorId: string;
  showSuggestions?: boolean; // default true，view-v2/page.tsx 可关
}
```

### UI 布局

```
┌─────────────────────────────────────────────────────────────────┐
│ [AI 建议 (N 条)] ────────────────────────────────── [▼ 收起]    │  header bar (固定底部)
├─────────────────────────────────────────────────────────────────┤
│  #42  tank_temp → 72.5  "温度偏高，建议降温"   [接受] [拒绝]   │  展开时显示列表
│  #43  pump_spd → 1200   "优化流速"             [接受] [拒绝]   │
└─────────────────────────────────────────────────────────────────┘
```

- 固定在容器底部 (`position: absolute; bottom: 0; left: 0; right: 0`)
- 默认展开；点击 header 收折
- 空状态：header 显示 "AI 建议 (0 条)" + "暂无待处理建议" 提示
- loading 状态：header 显示 "加载中…"
- error 状态：header 显示错误信息

### 内部 Hook: `useSuggestionsBar`

```typescript
function useSuggestionsBar(viewId: string, pollIntervalMs = 5000) {
  // 初始 fetch + setInterval 5s
  // accept(id) / reject(id) 调 api/scada 函数 + 乐观 remove
  // 返回 { suggestions, loading, error, accept, reject }
}
```

**过滤逻辑**：
```typescript
function matchesView(s: ScadaSuggestion, viewId: string): boolean {
  try {
    const meta = JSON.parse(s.reasoning ?? '');
    if (meta?.view_id) return meta.view_id === viewId;
  } catch { /* not JSON */ }
  return true; // 无 view_id 时宽松显示
}
```

---

## 6. RuntimeShell 改动

最小改动：在现有 `<div>` 内末尾追加 `<SuggestionsBar>`，加 `relative` 定位支撑 absolute bar。

```tsx
// Before
<div className="w-screen h-screen bg-zinc-100">
  <RuntimeCanvas ... />
</div>

// After
<div className="relative w-screen h-screen bg-zinc-100">
  <RuntimeCanvas ... />
  {showSuggestions && (
    <SuggestionsBar viewId={viewId} reactorId={reactorId} />
  )}
</div>
```

新 prop `showSuggestions?: boolean` 默认 `true`。

---

## 7. 安全约束 (不变量)

| 约束 | 执行点 |
|------|--------|
| AI suggestion accept → server dispatcher → PLC | `acceptSuggestion` API 已实现，SuggestionsBar 直接调用 |
| writeTag `opts.confirmed===true` gate | server dispatcher 内部，本组件不涉及 |
| 不直写 PLC | SuggestionsBar 仅调 POST /api/v1/ai/suggestions/:id/accept |
| 不动 animation-engine / gauge-registry | 严格范围，不接触 |

---

## 8. 测试计划

### Vitest (5-7 tests)

1. 渲染 pending suggestions 列表
2. 空状态显示 "暂无待处理建议"
3. 点击接受 → 调用 acceptSuggestion API
4. 点击拒绝 → 调用 rejectSuggestion API
5. 收折/展开 toggle
6. `showSuggestions=false` → 不渲染
7. viewId 过滤 — 仅显示匹配当前 view 的 suggestions

### Playwright E2E (1 test)

`e2e/scada-operator-ui.spec.ts`:
- 登录 → 创建 runtime view → 注入假 suggestion (via API) → 跳转 view-v2 → 验 SuggestionsBar 可见 → 点击接受 → 验 suggestion 从列表消失

---

## 9. 不做的事

- 不改 `/scada2/suggestions` 独立页（可选小修仅限 bug fix）
- 不实现 SSE 订阅（SP-FX-16 scope）
- 不加新第三方依赖
- 不改 WriteIntentDialog 流程
