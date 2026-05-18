# SP-FX-25 移动端/触屏优化 — 执行计划

日期: 2026-05-18
Sprint: SP-FX-25

---

## 任务列表

### T1: AppLayout responsive tests RED
- 文件: `src/components/layout/__tests__/AppLayout.mobile.test.tsx` (新建)
- 4 tests: 汉堡按钮 md:hidden, sidebar 折叠/展开, backdrop 关闭, 全宽 main
- 验证: vitest RED

### T2: AppLayout responsive 实现 GREEN
- 文件: `src/components/layout/AppLayout.tsx`
- 加 sidebarOpen state + hamburger button + backdrop overlay
- 验证: T1 全 GREEN

### T3: ViewListPanel sticky toolbar tests RED
- 文件: `src/components/scada/pages/__tests__/ViewListPanel.mobile.test.tsx` (新建)
- 3 tests: sticky-toolbar-container 存在, SearchBar 在内, ViewCardGrid 存在
- 验证: vitest RED

### T4: ViewListPanel sticky toolbar 实现 GREEN
- 文件: `src/components/scada/pages/ViewListPanel.tsx`
- 包裹 SearchBar + ViewListToolbar 进 sticky div
- 验证: T3 全 GREEN

### T5: EditorShell mobile fallback tests RED
- 文件: `src/scada-engine/editor/__tests__/editor-shell-mobile.test.tsx` (新建)
- 4 tests: mobile warning 存在, desktop 正常渲染, canvas 存在, windowWidth prop
- 验证: vitest RED

### T6: EditorShell mobile fallback 实现 GREEN
- 文件: `src/scada-engine/editor/editor-shell.tsx`
- 加 useWindowSize + mobile warning banner + read-only canvas
- 验证: T5 全 GREEN

### T7: PropertyPanel bottom-sheet tests RED
- 文件: `src/scada-engine/editor/properties/__tests__/PropertyPanel.mobile.test.tsx` (新建)
- 4 tests: mobileMode=false 正常, mobileMode=true bottom-sheet, drag handle, data-testid
- 验证: vitest RED

### T8: PropertyPanel bottom-sheet 实现 GREEN
- 文件: `src/scada-engine/editor/properties/PropertyPanel.tsx`
- 加 mobileMode prop + fixed bottom-sheet 样式
- 验证: T7 全 GREEN

### T9: RuntimeCanvas touch gesture tests RED
- 文件: `src/scada-engine/runtime/__tests__/RuntimeCanvas.touch.test.tsx` (新建)
- 5 tests: gesture wrapper 存在, scale clamp [0.5,3], pan offset, data-testid, cleanup
- 验证: vitest RED

### T10: RuntimeCanvas touch gesture 实现 GREEN
- 文件: `src/scada-engine/runtime/RuntimeCanvas.tsx`
- append Effect F: PointerEvent pinch-to-zoom + pan
- 验证: T9 全 GREEN, baseline 1079 不减

### T11: PW E2E mobile spec
- 文件: `e2e/scada-mobile.spec.ts` (新建)
- viewport 375x667, 3 tests (hamburger + viewlist + editor warning)
- 验证: file 存在即可 (server 不要求 running)

### T12: 全量验证 + push
- pnpm --filter=web-ui run test (expect >= 1097)
- tsc noEmit
- git pull --rebase origin main
- git push origin main

---

## 风险

- AppLayout SSR: `window` undefined -> useEffect guard
- PointerEvent: jsdom 不支持 -> mock in tests
- PropertyPanel: 不破坏原有 5 tests (BASE_CLASS 含 w-[250px])
