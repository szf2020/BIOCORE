# SP-FX-8 Polish Sprint — Design Spec

Date: 2026-05-18  
Sprint: SP-FX-8 (4–5 days)  
Author: autonomous agent  
Base commit: f5810c0

---

## Scope: 3 selected items

| # | Item | Priority | Rationale |
|---|------|----------|-----------|
| 1 | rAF → subscribe-driven animation eval | MUST | 60Hz 轮询 × 1Hz PLC = 59× 无效计算; 纯 CPU 浪费 |
| 2 | 旧 `/scada2/[viewId]` viewer 退役 | MUST | 双路由维护负担; view-v2 已完整覆盖 |
| 4 | CanvasController destroy soak | SHOULD | 旧路由退役前修复内存泄漏, 防止 soak 报告脏数据 |

未选: #3 live reload (scope 大, 需 SSE/WS event server 端配合), #5 operator UI (独立 sprint 合适).

---

## Item 1: rAF → Subscribe-Driven Animation Eval

### 现状

`RuntimeCanvas.tsx` Effect C 以 `requestAnimationFrame` 60Hz 轮询调用 `evalAnimations`，然后读 `useRealtimeStore.getState().reactorData[reactorId].processValues`。PLC tag 刷新通常 1Hz，绝大多数 rAF 帧无数据变化，但仍全量 eval 所有 animations。

### 改动

1. 删除 Effect C 的 rAF 循环。
2. 新增 Effect D: 用 `useRealtimeStore.subscribe(selector, listener)` 订阅 `processValues`，仅在 `processValues` 变更时调用 `evalAnimations` + `applyPatch`。
3. `selector`: `(s) => s.reactorData?.[reactorId]?.processValues`
4. 订阅返回 unsubscribe，在 Effect D 的 cleanup 里调用。
5. `resolveAnimations` 结果在 Effect A 末尾或 `useMemo` 里计算一次，存入 ref，供 Effect D 使用。

### 关键约束

- animation-engine.ts 保持零修改（安全不变量必须继续通过 T8 vitest 断言）。
- `applyPatch` 函数保持不变，直接迁移到 Effect D 调用链。
- `useRealtimeStore` 的 2-arg subscribe 与 tag-binding-bridge.ts 中已有用法相同（同样 `(useRealtimeStore as any).subscribe(selector, listener)`）。

### 影响文件

- `packages/web-ui/src/scada-engine/runtime/RuntimeCanvas.tsx` — Effect C 删除, Effect D 新增
- `packages/web-ui/src/scada-engine/runtime/__tests__/RuntimeCanvas.test.tsx` — 更新 mock + 新增 subscribe-path 测试

### 测试策略

- 现有 animation tick 测试改为通过 subscribe listener 触发（捕获 listener 后直接调用），而非 `advanceTimersByTime`。
- 新增 test: subscribe callback 未调用时 `evalAnimations` 不被调用（0Hz 行为验证）。
- 新增 test: 首次 subscribe callback 触发 → `evalAnimations` 被调用 + `applyPatch` 执行。

### 风险

- `useRealtimeStore.subscribe` 2-arg 选择器形式是 Zustand 内部 API（无 TypeScript 类型）。已有 tag-binding-bridge 使用相同模式，证明运行时可用。测试中 mock 已接受 2-arg。

---

## Item 2: 旧 `/scada2/[viewId]` Viewer 退役迁移

### 现状

`/scada2/[viewId]/page.tsx` 调用 `/api/scada/views/:id`（旧 API，返回 SvgViewJson，渲染 ScadaCanvas）。  
`/scada2/view-v2/[viewId]/page.tsx` 调用 `/api/v1/fuxa-views/:id`（新 API，返回 FuxaView，渲染 RuntimeShell）。  
旧路由对外可见，造成混淆。

### 改动策略: redirect-and-deprecate（不删除文件）

1. 修改 `/scada2/[viewId]/page.tsx` → 删除所有旧逻辑，改为渲染 redirect component：  
   用 `useRouter().replace('/scada2/view-v2/' + viewId + '?reactor=' + reactorId)` 立即跳转，同时显示 "跳转中…" 状态（避免白屏）。
2. 删除不再需要的 imports（ScadaCanvas, SvgViewJson, ensureBuiltinSvgWidgetsRegistered 等）。
3. 旧路由测试文件 `__tests__/page.test.tsx` 重写：测试 redirect 行为（`useRouter.replace` 被调用，参数包含 view-v2 路径）。

### 影响文件

- `packages/web-ui/src/app/scada2/[viewId]/page.tsx` — 全量重写（redirect 逻辑）
- `packages/web-ui/src/app/scada2/[viewId]/__tests__/page.test.tsx` — 重写为 redirect 测试

### 测试策略

- mock `next/navigation` → `useRouter` 返回 `{ replace: vi.fn() }`。
- 断言 replace 被调用，path 包含 `/scada2/view-v2/v1?reactor=F01`。
- 断言渲染 "跳转中" 文本（UX）。

### 风险

- 若有外部链接硬编码 `/scada2/[viewId]`，redirect 静默处理无破坏。
- 旧 ScadaCanvas 组件不删除（其他页面可能复用）。

---

## Item 4: CanvasController destroy Soak Fix

### 现状

`CanvasController.destroy()` 已存在（设 `this.destroyed = true`, `widgetMap.clear()`, `this.root.remove()`）。  
`RuntimeCanvas` Effect A cleanup 调用 `canvasRef.current = null`，但**未调用** `canvas.destroy()`。  
若组件快速 unmount/remount（如路由切换），旧 canvas 可能泄漏至下一帧。

### 改动

Effect A cleanup 中，在 `canvasRef.current = null` 之前调用 `canvas.destroy()`：

```typescript
return () => {
  unbind();
  for (const [, g] of gaugeMapRef.current) g.onUnmount();
  gaugeMapRef.current.clear();
  canvas.destroy();           // 新增
  canvasRef.current = null;
};
```

同时更新 `RuntimeCanvas.test.tsx` 中的 `mockCanvasCtrl` 增加 `destroy: vi.fn()`，并新增断言：unmount 时 `mockCanvasCtrl.destroy` 被调用。

### 影响文件

- `packages/web-ui/src/scada-engine/runtime/RuntimeCanvas.tsx` — Effect A cleanup 加一行
- `packages/web-ui/src/scada-engine/runtime/__tests__/RuntimeCanvas.test.tsx` — mock + 新增断言

### 测试策略

- 现有 "unmount cleanup" 测试扩展：新增 `expect(mockCanvasCtrl.destroy).toHaveBeenCalledOnce()`。
- 覆盖点: destroy 被调用在 unbind 和 onUnmount 之后（cleanup 顺序正确）。

### 风险

- `CanvasController.destroy()` 已有 `if (this.destroyed) return` 防双调用，幂等安全。
- `this.root.remove()` 在 jsdom 中执行无异常（已有其他测试验证）。

---

## 非功能需求

- ZERO 新第三方 dependency。
- 全部修改通过现有 `pnpm vitest run` 绿灯。
- animation-engine.ts 安全不变量 T8 测试继续 pass（零修改该文件）。

---

## 接口总结

| 模块 | 变更类型 | 公开接口变化 |
|------|----------|-------------|
| RuntimeCanvas.tsx | 内部实现 | 无 props 变化 |
| `/scada2/[viewId]/page.tsx` | 行为变更 | 无（redirect 透明） |
| CanvasController.destroy() | 已有方法 | 无 |
| animation-engine.ts | 零修改 | 无 |
