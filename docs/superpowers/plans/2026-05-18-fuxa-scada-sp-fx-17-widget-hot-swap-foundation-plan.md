# SP-FX-17 Widget Hot-Swap Foundation — Implementation Plan

**日期**: 2026-05-18  
**Sprint**: SP-FX-17  
**参考 Spec**: `docs/superpowers/specs/2026-05-18-fuxa-scada-sp-fx-17-widget-hot-swap-foundation-design.md`

---

## 任务列表

### Task 1: TDD RED — 写 8 个失败 unit tests
**文件**: `packages/web-ui/src/scada-engine/gauges/__tests__/gauge-registry.test.ts`  
**操作**: 在现有 3 tests 后追加 8 个新 describe block  
**验证**: `pnpm vitest run gauge-registry` — 8 个 FAIL (RED)

### Task 2: versioning API — GaugeMeta.version + getVersion()
**文件**: 
- `packages/web-ui/src/scada-engine/gauges/gauge-base.ts` — GaugeMeta 加 `version?: string`
- `packages/web-ui/src/scada-engine/gauges/gauge-registry.ts` — 加 `getVersion()`, register 存 version

**验证**: tests 1-3 转绿

### Task 3: replace API — register opts + EventEmitter
**文件**: `packages/web-ui/src/scada-engine/gauges/gauge-registry.ts`  
**操作**:
- import EventEmitter from 'events'
- private emitter = new EventEmitter()
- register(meta, opts?) 加 replace 分支
- GaugeReplaceEvent 接口加到 gauge-base.ts 并导出
- 加 onReplace() 方法

**验证**: tests 4-8 转绿

### Task 4: 全量验证
**操作**:
- `pnpm vitest run` → 1022 tests pass
- `controls-all-registered.test.ts` registry.size === 20 仍 pass
- `pnpm tsc --noEmit` → 0 errors

---

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `gauge-base.ts` | MODIFY | GaugeMeta 加 `version?`, 加 `GaugeReplaceEvent` interface |
| `gauge-registry.ts` | MODIFY | versioning + replace + EventEmitter |
| `__tests__/gauge-registry.test.ts` | MODIFY | 追加 8 new tests |

**不碰的文件**: gauge-base class / RuntimeCanvas / RuntimeShell / controls/* / server / batch2 / suggestions / SSE

---

## 成功标准

- [ ] 8 new unit tests GREEN
- [ ] 原有 3 tests 仍 GREEN  
- [ ] controls-all-registered.test.ts registry.size === 20 pass
- [ ] tsc 0 errors
- [ ] 总 vitest 数 = baseline 1014 + 8 = 1022
