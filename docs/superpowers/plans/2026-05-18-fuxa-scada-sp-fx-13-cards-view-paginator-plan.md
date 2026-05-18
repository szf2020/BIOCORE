# SP-FX-13 实施计划: View List Cards-View + Paginator

**Sprint**: SP-FX-13  
**日期**: 2026-05-18  
**Spec**: docs/superpowers/specs/2026-05-18-fuxa-scada-sp-fx-13-cards-view-paginator-design.md  
**Baseline**: web-ui 982, server 147, PW 36 pass/3 skip/0 fail

---

## 任务列表

### T1: data-service — listScadaViewsByProject 分页重载
**文件**: `packages/data-service/src/sqlite-service.ts`

- 在 `listScadaViewsByProject` 实现分页重载：无 opts → 旧路径; 有 opts → COUNT + LIMIT/OFFSET
- verify: server tests 仍 147+

---

### T2: server — GET /scada/projects/:projectId 分页参数
**文件**: `packages/server/src/scada-routes.ts`  
**测试**: `packages/server/src/__tests__/scada-routes.test.ts`

- 解析 `req.query.limit` / `req.query.offset` (整数校验, 默认不限制/0)
- 响应中加 `total` 字段
- TDD: 先写测试 (RED), 再实现 (GREEN)
- verify: server tests 147 → 150+

---

### T3: useViewList hook — 支持 page/size 参数
**文件**: `packages/web-ui/src/hooks/useViewList.ts`  
**测试**: `packages/web-ui/src/hooks/__tests__/useViewList.test.ts`

- 接受 `page: number` + `size: number` 参数
- 计算 `limit = size, offset = (page-1) * size`
- 返回值新增 `total: number`
- TDD: 先追加测试 (RED), 再改 hook (GREEN)
- verify: web-ui tests 不减少

---

### T4: ViewListToolbar 组件
**文件**: `packages/web-ui/src/components/scada/pages/ViewListToolbar.tsx`  
**测试**: `__tests__/ViewListToolbar.test.tsx`

- Props: `viewMode: 'cards'|'list'`, `onModeChange`, `pageSize`, `onPageSizeChange`
- LayoutGrid / List icon 按钮 (Lucide), active 高亮
- page-size `<select>` (12/24/48)
- TDD: 测试 → 实现
- verify: +4 tests

---

### T5: ViewCard + ViewCardGrid 组件
**文件**: `ViewCard.tsx`, `ViewCardGrid.tsx`  
**测试**: `__tests__/ViewCard.test.tsx`, `__tests__/ViewCardGrid.test.tsx`

ViewCard:
- Props: `view: ViewMeta`, `onEdit`, `onOpen`, `onDuplicate`, `onDelete`
- thumbnail: svgcontent 前 400 chars 放 `<svg>` preview; 否则灰色占位
- `data-testid="view-card"`

ViewCardGrid:
- className: `grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4`

TDD: 测试 → 实现  
verify: +8 tests

---

### T6: ViewListRows 组件 (提取现 list)
**文件**: `packages/web-ui/src/components/scada/pages/ViewListRows.tsx`

- 从 `ViewListPanel` 提取 `<ul>` list 渲染逻辑
- verify: web-ui 982 不减

---

### T7: ViewPaginator 组件
**文件**: `packages/web-ui/src/components/scada/pages/ViewPaginator.tsx`  
**测试**: `__tests__/ViewPaginator.test.tsx`

- page numbers max 7 visible
- prev/next 按钮
- `data-testid="paginator"`, `data-testid="page-btn-{N}"`, `data-testid="page-size-select"`
- TDD: 测试 → 实现
- verify: +8 tests

---

### T8: ViewListPanel 重构 — 集成 toggle + pagination + localStorage + URL
**文件**: `packages/web-ui/src/components/scada/pages/ViewListPanel.tsx`  
**测试**: `__tests__/ViewListPanel.test.tsx` (追加)

- useSearchParams 读 page/size
- useRouter().replace 写 URL
- localStorage 读写 `biocore.scada.viewListMode`
- 根据 viewMode 渲染 ViewCardGrid 或 ViewListRows
- scada2/page.tsx: 包裹 `<Suspense>`
- verify: +6 tests, web-ui tests ≥ 1012

---

### T9: E2E PW — scada-cards-view.spec.ts
**文件**: `packages/web-ui/e2e/scada-cards-view.spec.ts`

- login → /scada2 → seed view → 断言 cards → toggle list → toggle cards → edit link
- verify: PW 36 → 37 pass

---

### T10: Regression + tsc + push
- `pnpm --filter web-ui run test` → ≥ 1012
- `pnpm --filter server run test` → ≥ 150
- `pnpm --filter web-ui exec tsc --noEmit` → 0 errors
- PW → 37+ pass / 0 fail
- `git push`

---

## 顺序与依赖

```
T1 (data-service) → T2 (server) → T3 (hook) → T4/T5/T6/T7 (并行 UI) → T8 (panel 集成) → T9 (E2E) → T10 (regression+push)
```
