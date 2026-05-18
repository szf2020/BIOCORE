# SP-FX-19 审计日志实现计划

**Sprint**: SP-FX-19  
**日期**: 2026-05-18  
**参考设计**: `docs/superpowers/specs/2026-05-18-fuxa-scada-sp-fx-19-audit-log-design.md`

## 任务列表

### T1: DB Migration (034-audit-log.sql)
- 新建 `packages/server/migrations/034-audit-log.sql`
- 创建 audit_log 表 + 2 个索引
- 验证: 文件可被 SQLite 执行

### T2: data-service audit-log-service.ts (RED)
- 新建 `packages/data-service/src/__tests__/audit-log-service.test.ts`
- 写 3 个测试 (RED: insert / query userId / query resourceType)
- 验证: pnpm vitest run 显示 3 个失败

### T3: data-service audit-log-service.ts (GREEN)
- 新建 `packages/data-service/src/audit-log-service.ts`
- 实现 insertAuditLog + queryAuditLog
- 在 data-service/src/index.ts 中 export
- 验证: 3 个测试通过

### T4: server middleware audit-log.ts (RED)
- 新建 `packages/server/src/middlewares/__tests__/audit-log.test.ts`
- 写 5 个测试 (RED)
- 验证: 5 个失败

### T5: server middleware audit-log.ts (GREEN)
- 新建 `packages/server/src/middlewares/audit-log.ts`
- 实现 createAuditLogMiddleware
- 验证: 5 个测试通过

### T6: 注册 middleware + 添加 API 路由
- 修改 `packages/server/src/index.ts`:
  - import createAuditLogMiddleware
  - 在 app.use('/api/v1', ...) 行添加 createAuditLogMiddleware
  - 添加 GET /audit-log 路由（仅 admin）
- 验证: server tsc 通过

### T7: web-ui audit-log page (RED)
- 新建 `packages/web-ui/src/app/scada2/audit-log/__tests__/page.test.tsx`
- 写 6 个测试 (RED)
- 验证: 6 个失败

### T8: web-ui audit-log page (GREEN)
- 新建 `packages/web-ui/src/app/scada2/audit-log/page.tsx`
- 实现列表 + filter + 分页 + 角色检查
- 验证: 6 个测试通过

### T9: PW E2E
- 新建 `packages/web-ui/e2e/scada-audit-log.spec.ts`
- 1 个 spec: admin → 访问 audit-log 页 → 验证表格
- 验证: 文件语法正确

### T10: 全量 vitest + tsc + commit
- pnpm -r test (web-ui + server + data-service)
- pnpm -r tsc
- git add → commit → git pull --rebase → git push

## 成功标准

- server vitest: +5 (5 middleware tests)
- data-service vitest: +3
- web-ui vitest: +6
- migration 034 存在
- tsc 零错误
