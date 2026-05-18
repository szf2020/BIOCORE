# SP-FX-21: ViewList Filter/Search/Sort 实施计划

**Sprint**: SP-FX-21  
**日期**: 2026-05-18

---

## Task 列表

### T1: sqlite-service — listScadaViewsByProject 扩展 q/sort
- 文件: `packages/data-service/src/sqlite-service.ts`
- 扩展分页重载: opts 增加 `q?: string; sort?: string`
- 动态拼接 WHERE name LIKE + ORDER BY 映射
- 无参重载 + 无 q/sort 分支不变
- **verify**: `packages/data-service/src/__tests__/sqlite-service-fuxa-views.test.ts` 加 3 测试

### T2: scada-routes — GET /scada/projects/:projectId 加 q/sort
- 文件: `packages/server/src/scada-routes.ts`
- 读取 req.query.q / req.query.sort, 白名单校验 sort
- 无效 sort → 400; 无 limit 时忽略 q/sort (全量返回)
- 透传给 sqlite.listScadaViewsByProject
- **verify**: `packages/server/src/__tests__/scada-routes.test.ts` 加 4 测试

### T3: useViewList hook — 扩展 q/sort opts
- 文件: `packages/web-ui/src/hooks/useViewList.ts`
- UseViewListOpts 加 `q?: string; sort?: string`
- URL 构建追加 q/sort (有值才追加)
- **verify**: `packages/web-ui/src/hooks/__tests__/useViewList.test.ts` 加 2 测试

### T4: ViewListSearchBar 新组件 (RED → GREEN)
- 文件: `packages/web-ui/src/components/scada/pages/ViewListSearchBar.tsx` (新)
- 文件: `packages/web-ui/src/components/scada/pages/__tests__/ViewListSearchBar.test.tsx` (新)
- 先写 6 个 RED 测试, 再实现组件
- 包含: 搜索 input, sort select, tag chip multi-select, onChange 回调
- **verify**: 6 tests pass

### T5: ViewListPanel — 接入 SearchBar + 状态扩展
- 文件: `packages/web-ui/src/components/scada/pages/ViewListPanel.tsx`
- 从 searchParams 读取 q/sort/tags, 传给 useViewList + ViewListSearchBar
- handleFilterChange 更新 URL (page reset to 1)
- tag 前端过滤: 对 views 结果 filter
- **verify**: `ViewListPanel.test.tsx` 加 2 测试

### T6: PW E2E
- 文件: `packages/web-ui/e2e/scada-view-list-filter.spec.ts` (新)
- 1 测试: login → scada2 → seed 2 views → 搜索 → 验 URL → 切 sort → 验 URL
- **verify**: spec 文件存在

---

## 执行顺序

T1 → T2 → T3 → T4 → T5 → T6

## 成功标准

- web-ui vitest: 基线 1046 + 8~10 = 1054~1056
- server vitest: 基线 37 + 4 = 41
- URL 示例: `?q=demo&sort=name_asc&tag=prod&page=1&size=12`
- PW e2e: 1 spec
