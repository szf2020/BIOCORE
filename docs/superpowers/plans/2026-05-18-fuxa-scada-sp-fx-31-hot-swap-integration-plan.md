# SP-FX-31 Hot-Swap Integration Plan

**Sprint**: SP-FX-31
**Date**: 2026-05-18
**Spec**: `specs/2026-05-18-fuxa-scada-sp-fx-31-hot-swap-integration-design.md`

## 任务列表

### T1: TDD RED — 写测试 (hot-swap.test.tsx)

- 新建 `__tests__/RuntimeCanvas.hot-swap.test.tsx`
- mock gaugeRegistry 含 `onReplace` 方法，可捕获订阅回调
- 写 6 个测试用例 (见 spec 表格)
- 验证: `pnpm vitest run` → 新测试全部 RED (Effect G 尚未实现)

### T2: TDD GREEN — 实现 Effect G

- 在 `RuntimeCanvas.tsx` 末尾 append Effect G
- 依赖数组: `[view.id, reactorId]`
- 订阅 `gaugeRegistry.onReplace`，实现 unmount/remount 逻辑
- 验证: `pnpm vitest run` → 新 6 测试全 GREEN，旧 7 测试不破

### T3: tsc 类型检查 + vitest 全量

- `pnpm -F web-ui exec tsc --noEmit`
- `pnpm vitest run --project web-ui`
- 期望: web-ui tests >= 1119 + 6 新增 = 1125

### T4: Push

- `git pull --rebase origin main`
- `git push origin main`

## 验证标准

| 项 | 期望 |
|---|---|
| web-ui vitest 数 | baseline 1119 + 6 = 1125 (±1 容忍) |
| tsc --noEmit | 0 errors |
| animation-engine T8 | 仍 pass |
| Effect A/B/D/F | 不变 |
| 新 console.log | 0 |
| 新第三方 dep | 0 |
