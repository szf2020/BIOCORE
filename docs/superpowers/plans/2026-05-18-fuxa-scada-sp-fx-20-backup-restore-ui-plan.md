# SP-FX-20: Backup / Restore UI — Implementation Plan

**Sprint**: SP-FX-20  
**Date**: 2026-05-18  
**Spec**: docs/superpowers/specs/2026-05-18-fuxa-scada-sp-fx-20-backup-restore-ui-design.md

---

## Tasks

### Task 1: Server — backup-routes.ts (TDD RED 阶段)
- 新建 `packages/server/src/__tests__/backup-routes.test.ts`
- 写 5-7 个 RED 测试（全部 fail）
- verify: `pnpm --filter server test` 显示 RED

### Task 2: Server — backup-routes.ts 实现 (GREEN 阶段)
- 新建 `packages/server/src/backup-routes.ts`
- 实现 4 个 endpoints: POST /admin/backup, GET /admin/backups, GET /admin/backups/:filename, POST /admin/restore
- 实现三重安全检查: size limit + filename sanitize + magic bytes
- verify: `pnpm --filter server test` 全绿

### Task 3: Server — index.ts 注册
- 在 `packages/server/src/index.ts` 末尾 apiRouter 区域 append `registerBackupRoutes(apiRouter, { dataDir: DATA_DIR })`
- import 语句加在现有 import 块末尾
- verify: `pnpm --filter server build` 通过; tsc 无报错

### Task 4: Web-UI — backup/page.tsx (TDD RED 阶段)
- 新建 `packages/web-ui/src/app/scada2/backup/__tests__/page.test.tsx`
- 写 6-8 个 RED 测试
- verify: `pnpm --filter web-ui test` 显示 RED

### Task 5: Web-UI — backup/page.tsx 实现 (GREEN 阶段)
- 新建 `packages/web-ui/src/app/scada2/backup/page.tsx`
- 实现: 备份列表表格 + 立即备份 button + 下载链接 + 恢复 ConfirmDialog
- Role guard: admin only
- verify: `pnpm --filter web-ui test` 全绿

### Task 6: PW E2E — scada-backup-ui.spec.ts
- 新建 `packages/web-ui/e2e/scada-backup-ui.spec.ts`
- 1 个 e2e: admin 登录 → /scada2/backup → 触发备份 → 验证新行 → 下载验 attachment header
- verify: 文件存在, spec 语法正确 (tsc compile)

### Task 7: 全量验证 + push
- `pnpm --filter server test` (baseline 152 + 新增 5-7)
- `pnpm --filter web-ui test` (baseline 1036 + 新增 6-8)
- `pnpm tsc --noEmit` (两个包)
- `git pull --rebase origin main`
- `git push origin main`

---

## 约束检查

- ZERO 新第三方 dep (multer 已是 dep)
- macOS BSD sed → 全部用 Edit 工具
- pnpm 路径: `export PATH=$HOME/.hermes/node/bin:$PATH`
- index.ts race: 先 pull --rebase 再 push
