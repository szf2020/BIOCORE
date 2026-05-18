# SP-FX-24 设计规范 — 权限粒度 ACL + q/sort 回归修复

**Sprint**: SP-FX-24  
**日期**: 2026-05-18  
**作者**: claude-sonnet-4-6 (自治 agent)

---

## Part 1: q/sort Regression 根因分析

### 背景
任务描述说 server 有 3 个失败测试（SP-FX-21 回归，q/sort filter 未生效）。

### 实际调查结果
运行测试后发现：
- `scada-routes.test.ts` 全部 54 tests PASS — q/sort 已正常工作
- 失败的是 `auto-resume.test.ts`（import `@biocore/batch-engine` 解析失败）
- 原因：`batch-engine` 包未被构建，`dist/` 不存在

### 修复
构建依赖链：`plc-driver` → `batch-engine`，后 server tests 恢复到 170 pass (0 fail)。

### SQLiteService.listScadaViewsByProject 实现（已正确）
q 过滤：`AND name LIKE ?` 并 push `%{q}%` 到 binds。
sort 过滤：通过 SORT_MAP 映射 `name_desc` → `ORDER BY name DESC`。
实现无 bug，无需修改。

---

## Part 2: ACL View Ownership + Role-based Access

### 目标
为 `scada_views` 表添加 owner + ACL 字段，实现视图级权限控制。

### DB Schema (migration 035)
```sql
ALTER TABLE scada_views ADD COLUMN owner_id TEXT;
ALTER TABLE scada_views ADD COLUMN acl TEXT NOT NULL DEFAULT '{"users":[],"roles":["admin","operator"]}';
```

**ACL JSON 结构**:
```json
{ "users": ["uid-1", "uid-2"], "roles": ["admin", "operator"] }
```

Backfill: 现有行 owner_id = NULL, acl = `{"users":[],"roles":["admin","operator"]}`（迁移时 DEFAULT 自动补）。

### 访问控制规则
用户可访问视图的条件（OR关系）：
1. `user.role === 'admin'` → 无条件访问所有视图
2. `view.owner_id === user.user_id` → owner 可访问
3. `user.user_id` 在 `acl.users` 数组中
4. `user.role` 在 `acl.roles` 数组中

未通过 → 403 Forbidden  
未登录（req.user 不存在）→ 401 Unauthorized

### Middleware: enforceViewAccess
```
文件: packages/server/src/middlewares/view-acl.ts
导出: enforceViewAccess(sqlite: SQLiteService): RequestHandler
- 从 req.params.viewId 读取 view_id
- 调用 sqlite.getScadaView 取 view
- 检查访问权限（见上方规则）
- 无权 → 403
```

注册位置：`scada-routes.ts` 的视图级 endpoints:
- `GET  /scada/views/:viewId`
- `PUT  /scada/views/:viewId`
- `DELETE /scada/views/:viewId`

### list 端点 ACL 过滤
`GET /api/v1/scada/projects/:projectId`:
- admin → 返回全部视图（bypass）
- 其他 → 过滤出 user 有权访问的视图（owner 或 acl.users 或 acl.roles）

过滤在路由层用 JS 完成（不改 SQL），保持 total 语义：total = 有权访问的数量。

### 新 Endpoints
```
PATCH /api/v1/scada/views/:viewId/acl
  Body: { users: string[], roles: string[] }
  Auth: owner OR admin
  → 200 { success: true }

PATCH /api/v1/scada/views/:viewId/owner
  Body: { new_owner_id: string }
  Auth: admin only
  → 200 { success: true }
```

### SQLiteService 新方法
```typescript
getScadaViewAcl(viewId: string): { owner_id: string|null, acl: string } | null
updateScadaViewAcl(viewId: string, acl: { users: string[], roles: string[] }): void
updateScadaViewOwner(viewId: string, newOwnerId: string): void
```

### Web-UI AclEditor
- `AclEditor.tsx`: modal 组件
  - Props: `{ viewId, currentAcl, onClose, onSaved }`
  - 显示 users 列表 + roles 复选框
  - Save → `PATCH /api/v1/scada/views/:viewId/acl`
- `ViewCard.tsx`: 加"权限"按钮（Shield 图标）
  - 仅 owner 或 admin 可见
  - 点击 → 打开 AclEditor modal

### Audit Log 集成
PATCH 操作已被 SP-FX-19 的 audit-log middleware 自动记录。无需额外代码。

### 约束
- ZERO 新第三方依赖
- 不改 middlewares/auth.ts
- admin role 永远 bypass ACL
- 不破坏现有 170 server tests + 1079 web-ui tests
