# SP-FX-45 Plugin SDK Foundation — 实现计划

**Sprint**: SP-FX-45  
**日期**: 2026-05-18  
**依赖**: SP-FX-17 (gauge-registry), SP-FX-6 (property-schema), SP-FX-26 (i18n)

---

## Task 列表

### T1: Plugin contract types + 测试 (RED-first)
- 新建 `packages/web-ui/src/scada-engine/plugins/__tests__/types.test.ts`
- 写 4 个 type-guard 测试（duck-type 验证 BiocorePlugin 结构）
- 新建 `packages/web-ui/src/scada-engine/plugins/types.ts`
- 实现 BiocorePlugin interface
- 验证: 4 tests GREEN

### T2: Plugin loader + 测试 (RED-first)
- 新建 `packages/web-ui/src/scada-engine/plugins/__tests__/loader.test.ts`
- 写 8 个测试覆盖 register/unregister/list + 安全检查 + 重复注册
- 新建 `packages/web-ui/src/scada-engine/plugins/loader.ts`
- 实现 registerPlugin/unregisterPlugin/listPlugins
- 验证: 8 tests GREEN

### T3: Sample plugin ClockWidget + 测试 (RED-first)
- 新建 `packages/web-ui/src/scada-engine/plugins/samples/__tests__/clock-widget-plugin.test.ts`
- 写 6 个测试（plugin 结构/onMount/onUnmount/onProcess/未自动注册）
- 新建 `packages/web-ui/src/scada-engine/plugins/samples/clock-widget-plugin.ts`
- 实现 ClockGauge + clockWidgetPlugin 导出
- 验证: 6 tests GREEN

### T4: Barrel index 导出
- 新建 `packages/web-ui/src/scada-engine/plugins/index.ts`
- 导出 types / loader / samples
- 验证: tsc clean

### T5: Admin UI page + 测试 (RED-first)
- 新建 `packages/web-ui/src/app/scada2/plugins/__tests__/page.test.tsx`
- 写 5 个测试（渲染/加载/卸载/错误）
- 新建 `packages/web-ui/src/app/scada2/plugins/page.tsx`
- 实现 plugin 管理 UI
- 验证: 5 tests GREEN

### T6: docs/plugin-sdk.md
- 新建 `docs/plugin-sdk.md`
- 内容：接口规范/sample 引用/加载流程/远程 plugin 路线

### T7: 全量验证 + push
- 运行全量 vitest (目标 1180+)
- 运行 tsc --noEmit
- git pull --rebase origin main
- git push origin main

---

## 约束提醒

- TDD RED-first: 每 task 先写测试再写实现
- ZERO 新第三方 dep
- 不改动: gauge-registry / gauge-base / dict-zh / dict-en / useLocale
- macOS BSD sed 不用; 用 Edit tool
- pnpm: export PATH=$HOME/.hermes/node/bin:$PATH
