# SP-FX-19 审计日志 (Audit Log) 设计文档

**Sprint**: SP-FX-19  
**日期**: 2026-05-18  
**状态**: APPROVED

## 目标

为 BIOCore 后端添加完整的用户操作审计日志系统，记录所有写操作（POST/PUT/PATCH/DELETE），并提供管理员专用的前端查看页面。

## 架构概览

```
HTTP 请求 → auditLogMiddleware (app-level) → authMiddleware → routes
                    ↓ 异步
              audit_log 表 (SQLite)
                    ↑
              auditLogService.insertAuditLog()

管理员前端 → /scada2/audit-log/page.tsx → GET /api/v1/audit-log
                                              ↓
                                         auditLogService.queryAuditLog()
```

## Part 1: DB Migration — 034-audit-log.sql

**表名**: `audit_log`（注意：与现有批次的 `audit_logs` 不同，新表不带 s 以保持独立）

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT,          -- JWT sub 或 API Key id，未认证时为 NULL
  action        TEXT NOT NULL, -- HTTP method: POST/PUT/PATCH/DELETE
  resource_type TEXT NOT NULL, -- 从 URL 路径提取: e.g. 'batches', 'recipes'
  resource_id   TEXT,          -- 路径参数: e.g. '42'，无时为 NULL
  payload       TEXT,          -- JSON.stringify(req.body)，超出 4096 字节截断
  ip            TEXT,          -- req.ip
  timestamp     DATETIME NOT NULL DEFAULT (datetime('now'))
);
```

**索引**:
- `idx_audit_log_user_ts ON audit_log(user_id, timestamp DESC)`
- `idx_audit_log_resource_ts ON audit_log(resource_type, resource_id, timestamp DESC)`

## Part 2: 审计中间件 — audit-log.ts

**文件**: `packages/server/src/middlewares/audit-log.ts`

**逻辑**:
1. 跳过条件: GET、HEAD、OPTIONS、路径含 `/health`、`/status`、`/events`（SSE）
2. 从 URL 解析 `resource_type`（路径第3段）和 `resource_id`（路径第4段）
3. `payload`: `JSON.stringify(req.body)`，超 4096 字节截断
4. 写入使用工厂注入的 `db`，避免循环依赖
5. 写失败不影响主请求（catch 静默 + console.error）

**工厂函数**: `createAuditLogMiddleware(db: Database.Database): RequestHandler`

**5 个测试**:
1. GET 请求不写 audit
2. POST 请求写 audit 行（含 user_id / resource_type / resource_id）
3. 健康检查路径跳过
4. body 超 4096 截断
5. DB 写失败不影响 next() 调用

## Part 3: 数据服务 — audit-log-service.ts

**文件**: `packages/data-service/src/audit-log-service.ts`

```typescript
interface AuditLogEntry {
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  payload: string | null;
  ip: string | null;
}

interface AuditLogQuery {
  userId?: string;
  resourceType?: string;
  limit: number;
  offset: number;
}

function insertAuditLog(db: Database.Database, entry: AuditLogEntry): void
function queryAuditLog(db: Database.Database, query: AuditLogQuery): AuditLogRow[]
```

**2-3 个测试**: insert + query（userId/resourceType 过滤）

## Part 4: 注册到 server/index.ts

在 `app.use('/api/v1', v1ResponseWrapper, authMiddleware, apiRouter)` 行中插入 auditLogMiddleware，
顺序：`auditLogMiddleware` → `v1ResponseWrapper` → `authMiddleware` → `apiRouter`

实际执行：修改该行追加 auditLogMiddleware。

## Part 5: 管理员页面 — /scada2/audit-log/page.tsx

**路径**: `packages/web-ui/src/app/scada2/audit-log/page.tsx`

**功能**:
- 展示最近 100 条 audit_log 记录（表格）
- Filter: user_id 输入框 + resource_type 下拉
- 分页: 上一页 / 下一页（每页 20 条）
- 角色检查: `useCurrentUser().role !== 'admin'` → 显示"无权访问"

**列**: 时间、用户、操作、资源类型、资源ID、IP

**API**: `GET /api/v1/audit-log?userId=&resourceType=&limit=20&offset=0`

**6 个测试**:
1. 列表渲染 (render + 至少1行)
2. user filter 触发重新 fetch
3. resource type filter 触发重新 fetch
4. 分页 next/prev
5. admin 角色可访问（不显示无权提示）
6. 非 admin 显示无权提示

## Part 6: PW E2E

**文件**: `packages/web-ui/e2e/scada-audit-log.spec.ts`

1 个 spec（1 test）: admin login → 访问 /scada2/audit-log → 验证表格可见

## 约束

- ZERO 新第三方依赖
- migration 序号: 034（现有最高 033）
- 不碰 auth.ts / scada-routes.ts / RuntimeCanvas / plc-driver
- TDD RED-first
