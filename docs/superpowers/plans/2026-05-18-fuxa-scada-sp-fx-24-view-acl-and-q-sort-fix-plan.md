# SP-FX-24 实施计划 — 权限粒度 ACL + q/sort 回归修复

**Sprint**: SP-FX-24  
**日期**: 2026-05-18  
**文件**: sp-fx-24-view-acl-and-q-sort-fix

---

## Task 0: 修复 q/sort Regression (优先)

**状态**: DONE (已验证)
- scada-routes.test.ts 54/54 PASS
- auto-resume.test.ts 失败原因是 batch-engine dist/ 缺失 → 构建后恢复
- server 当前：170 pass, 0 fail

---

## Task 1: DB Migration 035 — scada_views ACL 字段

**文件**: `packages/server/migrations/035-view-acl.sql`
**内容**:
- `ALTER TABLE scada_views ADD COLUMN owner_id TEXT`
- `ALTER TABLE scada_views ADD COLUMN acl TEXT NOT NULL DEFAULT '{"users":[],"roles":["admin","operator"]}'`

**验证**: 迁移文件存在且语法正确

---

## Task 2: SQLiteService 新 ACL 方法 (TDD)

**文件**: `packages/data-service/src/sqlite-service.ts`
**方法**:
- `updateScadaViewAcl(viewId, acl)` — 更新 acl 字段
- `updateScadaViewOwner(viewId, newOwnerId)` — 更新 owner_id

同步更新 `ScadaView` type 类型定义，加 `owner_id` + `acl` 字段（已有 getScadaView）。

**验证**: data-service vitest >= 92

---

## Task 3: view-acl.ts Middleware (TDD)

**文件**: `packages/server/src/middlewares/view-acl.ts` (新建)
**功能**: `enforceViewAccess(sqlite): RequestHandler`
**逻辑**:
1. 取 req.user → 无则 401
2. 取 req.params.viewId → 无则 400
3. admin → next()
4. 取 view → 无则 404
5. 解析 acl JSON，检查 owner / users / roles
6. 无权 → 403

**测试文件**: `packages/server/src/__tests__/view-acl.test.ts` (新建)
**测试用例** (5-7):
- admin always passes
- owner passes
- user in acl.users passes
- role in acl.roles passes
- unauthorized → 403
- no user → 401
- view not found → 404

**验证**: 所有新测试 GREEN

---

## Task 4: scada-routes.ts 集成 ACL Middleware

**文件**: `packages/server/src/scada-routes.ts`
**改动**:
- import `enforceViewAccess` from `./middlewares/view-acl`
- `GET  /scada/views/:viewId` 加 enforceViewAccess 中间件
- `PUT  /scada/views/:viewId` 加 enforceViewAccess 中间件
- `DELETE /scada/views/:viewId` 加 enforceViewAccess 中间件
- `GET /scada/projects/:projectId` list 端点：过滤不可访问的视图

**新增 endpoint**:
- `PATCH /scada/views/:viewId/acl` — owner OR admin 改 ACL
- `PATCH /scada/views/:viewId/owner` — admin only 转 owner

**测试文件**: `packages/server/src/__tests__/scada-acl-routes.test.ts` (新建)
**新增测试** (7-9):
- ACL 中间件集成：非 owner/admin 访问视图 → 403
- PATCH acl by owner → 200
- PATCH acl by non-owner → 403
- PATCH owner by admin → 200
- list 过滤：只返回有权访问的视图

**验证**: server vitest >= 177

---

## Task 5: Web-UI AclEditor.tsx (TDD)

**文件**: `packages/web-ui/src/components/scada/views/AclEditor.tsx` (新建)
**Props**: `{ viewId: string; currentAcl: Acl; currentUserId: string; currentUserRole: string; onClose(): void; onSaved(): void }`
**功能**:
- 显示当前 users 列表（可增删）
- 显示 roles 复选框（admin/operator/engineer/viewer）
- Save 按钮 → fetch PATCH acl → onSaved()
- Cancel → onClose()

**测试文件**: `packages/web-ui/src/components/scada/views/__tests__/AclEditor.test.tsx` (新建)
**测试用例** (6-7):
- 渲染 users 列表
- 渲染 roles 复选框
- 添加 user
- 切换 role
- save 调用 fetch PATCH
- cancel 调用 onClose

**验证**: web-ui vitest >= 1085

---

## Task 6: ViewCard.tsx 加"权限"按钮

**文件**: `packages/web-ui/src/components/scada/pages/ViewCard.tsx`
**改动**:
- 接收新 prop: `currentUserId?: string; currentUserRole?: string; onAcl?: (viewId: string) => void`
- 仅当 `onAcl` 存在 且 (user 是 owner OR role=admin) 时显示"权限"按钮
- 按钮 data-testid="view-card-acl-btn"

**测试文件**: `packages/web-ui/src/components/scada/pages/__tests__/ViewCard.test.tsx` (扩展)
**新增测试**:
- admin 看到 acl 按钮
- owner 看到 acl 按钮
- 无 onAcl prop 时不显示 acl 按钮
- 点击 acl 按钮调用 onAcl

**验证**: ViewCard 测试全部 GREEN

---

## 执行顺序

```
Task 0 (已完成: batch-engine build)
Task 1: migration SQL → commit
Task 2: SQLiteService methods + types → commit
Task 3: view-acl middleware (TDD) → commit
Task 4: scada-routes 集成 + ACL endpoints → commit
Task 5: AclEditor.tsx (TDD) → commit
Task 6: ViewCard 加权限按钮 → commit
Phase 5: 全量 vitest + tsc + push
```

## 成功标准

- server: >= 177 pass, 0 fail
- web-ui: >= 1085 pass
- data-service: >= 92 pass
- tsc: 0 error
