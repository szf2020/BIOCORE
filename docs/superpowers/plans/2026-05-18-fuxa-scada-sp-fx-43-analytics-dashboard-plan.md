# SP-FX-43 Analytics Dashboard — Implementation Plan

日期: 2026-05-18  
Sprint: SP-FX-43

---

## Task 列表

### Task 1: analytics-service (TDD RED)
- 创建 `packages/data-service/src/__tests__/analytics-service.test.ts`
- 写 6-8 个测试 (in-memory SQLite + baseline+034 migrations)
- 测试覆盖: queryViewUsage / queryWidgetTypes / queryUserActivity / queryWriteIntentStats
- 此时无实现，测试应 FAIL (RED)

### Task 2: analytics-service (GREEN)
- 创建 `packages/data-service/src/analytics-service.ts`
- 实现 4 个 query 函数
- 通过 Task 1 所有测试

### Task 3: analytics-routes (TDD RED)
- 创建 `packages/server/src/__tests__/analytics-routes.test.ts`
- 写 6-8 个路由测试 (supertest + in-memory DB)
- 测试覆盖: admin-only guard, range 参数解析, 4 个 endpoint 返回格式
- 此时无实现，测试应 FAIL (RED)

### Task 4: analytics-routes (GREEN)
- 创建 `packages/server/src/analytics-routes.ts`
- 实现 4 个 endpoint
- 通过 Task 3 所有测试

### Task 5: register routes in server/index.ts
- 在 `packages/server/src/index.ts` 末尾 append import + register
- 验证 server tests 全通过

### Task 6: web-ui analytics page (TDD RED)
- 创建 `packages/web-ui/src/app/scada2/analytics/__tests__/page.test.tsx`
- 写 8-10 个测试 (render + mock fetch)
- 此时无实现，测试应 FAIL (RED)

### Task 7: web-ui analytics page (GREEN)
- 创建 `packages/web-ui/src/app/scada2/analytics/page.tsx`
- 4 panel + date range picker + admin guard
- 通过 Task 6 所有测试

### Task 8: docs/analytics.md
- 创建 `docs/analytics.md`
- 指标定义 + SQL 示例 + 扩展指南

---

## 验证标准

- server vitest: 252 + 8-10 = 260-262 passed
- web-ui vitest: 1157 + 10-12 = 1167-1169 passed
- tsc 无新 error
- 4 个 endpoint admin-only guard 生效
