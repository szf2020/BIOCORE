# SP-FX-14 Batch 2 Widget 增强实施计划

## 参考设计
[2026-05-18-fuxa-scada-sp-fx-14-batch2-enhancements-design.md](../specs/2026-05-18-fuxa-scada-sp-fx-14-batch2-enhancements-design.md)

## Baseline
- web-ui vitest: 1014
- server vitest: 152
- PW: 37 pass
- HEAD: 46c9aff

## 目标
+15 vitest（3 widget × 5 test 各）。全测通过。不破 animation-engine 安全不变量。

---

## Task 列表

### Task 1: PipeGauge flow animation — RED tests (+5)
**文件**: `gauges/__tests__/controls/batch2/pipe.test.ts`
- 追加 5 个测试：flowDirection='cw' runtime 有 stroke-dasharray；有 interval；'none' 无 interval；editor 无 interval；onUnmount 清除 interval
- 使用 vi.useFakeTimers() + vi.runAllTimers() 验证 interval 触发
- 运行 → 期望 RED（测试通过数不增加，实现未改）

### Task 2: PipeGauge flow animation — 实现 (GREEN)
**文件**: `gauges/controls/batch2/pipe.tsx`
- PipeProperty 增加 flowDirection 和 flowSpeed 字段
- 增加 private flowInterval 和 private dashOffset
- onMount 调用 startFlowAnimation
- onUnmount 调用 stopFlowAnimation
- onPropertyChange 先 stop 再 start
- 运行 → GREEN（+5 tests）

### Task 3: HtmlSwitchGauge bitmask — RED tests (+5)
**文件**: `gauges/__tests__/controls/batch2/html-switch.test.tsx`
- 追加 5 个测试（见 spec）：bitmask=0/1 onProcess 验证；bitmask write-back 验证
- 运行 → RED

### Task 4: HtmlSwitchGauge bitmask — 实现 (GREEN)
**文件**: `gauges/controls/batch2/html-switch.tsx`
- SwitchProperty 增加 bitmask 字段
- onProcess 分支：bitmask 模式 vs 原逻辑
- change handler 分支：bitmask 模式用 readValue read-modify-write
- 运行 → GREEN（+5 tests）

### Task 5: GaugeSemaphore blink/hide/show — RED tests (+5)
**文件**: `gauges/__tests__/controls/batch2/gauge-semaphore.test.ts`
- 追加 5 个测试（见 spec）：hide/show style；blink interval；no-match；onUnmount 清除
- 使用 vi.useFakeTimers() 验证 blink interval
- 运行 → RED

### Task 6: GaugeSemaphore blink/hide/show — 实现 (GREEN)
**文件**: `gauges/controls/batch2/gauge-semaphore.tsx`
- SemaphoreAction interface + semaphoreActions in SemaphoreProperty
- private blinkInterval
- evalSemaphoreActions(numVal) 遍历 range 匹配，执行 hide/show/blink
- onProcess 末尾调用 evalSemaphoreActions
- onUnmount clearInterval
- 运行 → GREEN（+5 tests）

---

## 验证
- pnpm --filter web-ui vitest run → 期望 1029 总数（+15）
- pnpm --filter web-ui tsc --noEmit → 0 errors
- animation-engine 测试仍 pass
- git pull --rebase origin main && git push origin main
