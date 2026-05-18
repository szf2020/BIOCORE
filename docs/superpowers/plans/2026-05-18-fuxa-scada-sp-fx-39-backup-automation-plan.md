# SP-FX-39 执行计划：Backup Automation (Scheduled + Retention)

**日期**: 2026-05-18
**Sprint**: SP-FX-39

---

## 任务列表

### T1: 创建 backup-scheduler.ts + TDD tests (RED-first)
- 新建 `packages/server/src/services/backup-scheduler.ts`
- 新建 `packages/server/src/__tests__/backup-scheduler.test.ts`
- 先写 RED 测试 (setInterval mock / fake date / retention prune)
- 验证: vitest run — RED
- 实现 BackupScheduler class
- 验证: vitest run — GREEN (+10-13 tests)

### T2: backup-routes.ts 加 schedule endpoints
- 编辑 `packages/server/src/backup-routes.ts`
- 添加 GET /admin/backup/schedule + POST /admin/backup/schedule
- 先写 RED 测试，再实现
- 验证: backup-routes.test.ts 绿

### T3: index.ts 末尾加 scheduler start/stop
- 编辑 `packages/server/src/index.ts`
- 在 start() 末尾 append: 创建 BackupScheduler + scheduler.start()
- 在 gracefulShutdown 加 scheduler.stop()
- 验证: tsc 无 error

### T4: web-ui backup/page.tsx 加 Schedule UI
- 编辑 `packages/web-ui/src/app/scada2/backup/page.tsx`
- 添加 ScheduleSection 组件（内联）
- GET /api/v1/admin/backup/schedule 获取状态
- POST /api/v1/admin/backup/schedule 更新配置
- 先写 RED 测试，再实现
- 验证: web-ui vitest run — GREEN (+4 tests)

### T5: docs/backup-strategy.md
- 新建 `docs/backup-strategy.md`
- 包含: 调度策略 + 保留策略 + 远程上传 (future) + 灾备 SOP

### T6: 全量验证 + git push
- pnpm run test (server: 221+10-13, web-ui: 1142+4)
- tsc 无 error
- git pull --rebase origin main
- git push origin main

---

## 成功标准

| 检查 | 期望 |
|------|------|
| server vitest | ≥ 231 tests (221+10) |
| web-ui vitest | ≥ 1146 tests (1142+4) |
| tsc build | 0 errors |
| GET /api/v1/admin/backup/schedule | 200 + JSON state |
| POST /api/v1/admin/backup/schedule | 200 + updated state |
| backup-scheduler.ts 行数 | < 400 |
| index.ts 改动 | 仅 append 末尾 |

---

## 文件范围 (严格)

**新增:**
- `packages/server/src/services/backup-scheduler.ts`
- `packages/server/src/__tests__/backup-scheduler.test.ts`
- `docs/backup-strategy.md`
- `docs/superpowers/specs/2026-05-18-fuxa-scada-sp-fx-39-backup-automation-design.md`
- `docs/superpowers/plans/2026-05-18-fuxa-scada-sp-fx-39-backup-automation-plan.md`

**修改:**
- `packages/server/src/backup-routes.ts` (加 schedule endpoints)
- `packages/server/src/index.ts` (末尾 append scheduler start)
- `packages/web-ui/src/app/scada2/backup/page.tsx` (加 schedule UI)
- `packages/server/src/__tests__/backup-routes.test.ts` (加 schedule API tests)
- `packages/web-ui/src/app/scada2/backup/__tests__/page.test.tsx` (加 schedule UI tests)
