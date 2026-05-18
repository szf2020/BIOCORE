# SP-FX-8 Polish Sprint — Implementation Plan

Date: 2026-05-18  
Spec: `docs/superpowers/specs/2026-05-18-fuxa-scada-sp-fx-8-polish-design.md`  
Base commit: f5810c0  
Baseline vitest: web-ui 856, server 147, data-service 84, scripts 7

---

## Task List

### Item 4: CanvasController destroy (smallest, do first — unblocks Item 1 test update)

**T4-A: RED — RuntimeCanvas unmount test asserts destroy() called**
- 在 `RuntimeCanvas.test.tsx` 的 `mockCanvasCtrl` 增加 `destroy: vi.fn()`
- 在现有 "unmount cleanup" it-block 里新增 `expect(mockCanvasCtrl.destroy).toHaveBeenCalledOnce()`
- 运行测试 → RED (destroy not called yet)
- Verify: `pnpm vitest run src/scada-engine/runtime/__tests__/RuntimeCanvas.test.tsx` 报 1 failure

**T4-B: GREEN — Effect A cleanup 调用 canvas.destroy()**
- 在 `RuntimeCanvas.tsx` Effect A return 函数中加 `canvas.destroy()` 一行
- Verify: 上述测试变绿; 全 vitest green
- Commit: `test+fix(scada): destroy soak — canvas.destroy() in Effect A cleanup (SP-FX-8 T4)`

---

### Item 1: rAF → Subscribe-Driven Animation Eval

**T1-A: RED — 新增 subscribe-path 测试**
- 在 `RuntimeCanvas.test.tsx`:
  - 更新 `useRealtimeStore` mock: 从 `{ getState: vi.fn(...) }` 改为 `{ subscribe: vi.fn().mockReturnValue(vi.fn()) }`
  - 新增 it: "subscribe callback called → evalAnimations called once"
  - 新增 it: "subscribe callback NOT called → evalAnimations NOT called"
  - 新增 it: "unmount → subscribe unsubscribe called"
- Verify: 运行 RuntimeCanvas.test.tsx → 3 new failures

**T1-B: GREEN — Effect C 替换为 Effect D (subscribe-driven)**
- 删除 Effect C (rAF 循环)
- 新增 Effect D 用 useRealtimeStore.subscribe(selector, listener) 驱动 evalAnimations + applyPatch
- 移除 vi.useFakeTimers()（测试文件中）
- Verify: RuntimeCanvas.test.tsx 全绿; animation-engine T8 pass; 全 vitest green
- Commit: `test+feat(scada): rAF→subscribe-driven animation eval (SP-FX-8 T1)`

---

### Item 2: 旧 `/scada2/[viewId]` Viewer 退役

**T2-A: RED — 重写 page.test.tsx 为 redirect 断言**
- 删除现有 6 个 fetch-based it-blocks
- 新增: "renders 跳转中 immediately" + "calls router.replace with view-v2 path"
- Verify: tests RED (旧 Page 还在)

**T2-B: GREEN — 重写 /scada2/[viewId]/page.tsx 为 redirect**
- 删除全部旧实现，改为 useEffect + router.replace 跳转到 /scada2/view-v2/[viewId]
- 保留 "跳转中…" 占位 UI
- Verify: page.test.tsx 绿; 全 vitest green
- Commit: `test+feat(scada): retire old /scada2/[viewId] viewer → redirect to view-v2 (SP-FX-8 T2)`

---

## Final Verification

- `pnpm vitest run src/scada-engine/services/__tests__/animation-engine.test.ts` → T8 safety invariant PASS
- `pnpm vitest run` → all green
- `git push`

---

## Stop Conditions

| SC | Description | Verified by |
|----|-------------|-------------|
| SC-1 | subscribe replaces rAF in RuntimeCanvas | T1-B test |
| SC-2 | evalAnimations called only when processValues changes | T1-A new tests |
| SC-3 | old /scada2/[viewId] redirects to view-v2 | T2-A/B tests |
| SC-4 | canvas.destroy() called on unmount | T4-A/B test |
| SC-5 | animation-engine.ts unchanged, T8 passes | grep + vitest |
| SC-6 | zero new third-party deps | pnpm ls |
| SC-7 | vitest total ≥ baseline | final run |
