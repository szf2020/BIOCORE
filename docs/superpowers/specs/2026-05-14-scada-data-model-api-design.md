# SCADA 数据模型 + 存储 API 设计

**日期**: 2026-05-14
**子项目**: BIOCore 原生 SCADA 子系统 — 阶段 1/7
**前置**: 方案 A (FUXA 去 docker) 完成
**目标**: 取代 FUXA 项目存储, 为后续 Tag 订阅 / Widget 库 / 运行时 / 编辑器 / 迁移 / 替换 7 个子项目奠基

## 背景

当前 FUXA 走 monorepo native node (方案 A 完成), 项目数据存于 FUXA 自有 SQLite (`fuxa/appdata/project.fuxap.db`, schema: `views/devices/alarms/...` 全为 `(name TEXT PRIMARY KEY, value TEXT)` 的 JSON blob 模式)。

用户选择**用 Next.js 完全重写编辑器** (动机: 减少依赖 / 轻量级), 因此需要:
1. 把 SCADA 项目存储迁入 BIOCore 主库 `biocore.db`
2. 暴露 REST + WS 接口供前端编辑器 + 运行时调用
3. 复用 BIOCore JWT 鉴权 + 审计追踪 + WS 广播基础设施

## 范围

**包含**:
- DB schema (`scada_projects` + `scada_views` 两张表)
- data-service 层 CRUD 方法
- REST endpoints (项目 + 视图 CRUD)
- WS broadcast 通道
- 鉴权 + 审计追踪集成
- 单元 + 集成测试

**不包含** (后续子项目):
- Widget 类型定义 / React 组件 (子项目 3)
- 客户端订阅 hook (子项目 2)
- 渲染层 / 编辑器 UI (子项目 4/5)
- FUXA `project.fuxap.db` 迁移工具 (子项目 6)

## 1. 数据模型

**迁移文件**: `packages/server/migrations/028-scada-schema.sql`

```sql
CREATE TABLE IF NOT EXISTS scada_projects (
  project_id  TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scada_views (
  view_id       TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES scada_projects(project_id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  reactor_id    TEXT,                       -- NULL=通用画面 (非反应器特定)
  display_order INTEGER NOT NULL DEFAULT 0,
  width         INTEGER NOT NULL DEFAULT 1280,
  height        INTEGER NOT NULL DEFAULT 720,
  background    TEXT NOT NULL DEFAULT '#ffffff',
  items_json    TEXT NOT NULL DEFAULT '{}',
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_scada_views_project ON scada_views(project_id);
CREATE INDEX IF NOT EXISTS idx_scada_views_reactor ON scada_views(reactor_id);
```

### items_json 形状 (前端契约, 后端不解析)

```ts
type ItemsJson = Record<string, Widget>;

interface Widget {
  type: string;            // 'tank' | 'valve' | 'pump' | 'indicator' | 'trend' | 'button' | ...
  x: number; y: number;
  w: number; h: number;
  rotation?: number;
  props: Record<string, any>;        // type-specific: color, label, range, etc.
  bindings?: Binding[];
}

interface Binding {
  tag: string;             // BIOCore tag ID (e.g. 'F01.AI-0' or batch field)
  prop: string;            // widget prop to drive (e.g. 'value', 'color', 'visible')
  transform?: string;      // optional JS expression (e.g. 'v > 100 ? "red" : "green"')
}
```

后端只对 items_json 做大小限制 (默认 500KB / view), 不校验结构 (避免与前端 widget 类型耦合)。

### 关键决策

- **混合存储 (元数据列 + items JSON)**: 元数据可索引 (`reactor_id` 按罐查询), items 整体读写 (单 view 50-500KB)
- **`ON DELETE CASCADE`**: 删项目自动清 views, 避免孤儿数据
- **不拆 widget 表**: widget 数量 50-200/view, 关系拆分会让单视图加载产生数百次 JOIN
- **客户端生成 ID**: `project_id` / `view_id` 由前端生成 `crypto.randomUUID()`, 后端验唯一性, 简化幂等性

## 2. REST API

新文件 `packages/server/src/scada-routes.ts`, 由 `index.ts` 注册到 `apiRouter`。

### 项目 CRUD

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/api/v1/scada/projects` | `requireAuth` | — | `{ items: ProjectMeta[] }` (无 views) |
| GET | `/api/v1/scada/projects/:projectId` | `requireAuth` | — | `ProjectMeta & { views: ViewMeta[] }` (views 只含元数据) |
| POST | `/api/v1/scada/projects` | `requireRole('admin','engineer')` | `{ project_id, name, description? }` | `{ success, project_id }` |
| PUT | `/api/v1/scada/projects/:projectId` | `requireRole('admin','engineer')` | `Partial<{ name, description }>` | `{ success }` |
| DELETE | `/api/v1/scada/projects/:projectId` | `requireRole('admin','engineer')` | — | `{ success, deleted_views: number }` |

### 视图 CRUD

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/api/v1/scada/views/:viewId` | `requireAuth` | — | `View` (含 items 解析对象) |
| POST | `/api/v1/scada/projects/:projectId/views` | `requireRole('admin','engineer')` | `{ view_id, name, reactor_id?, width?, height?, items? }` | `{ success, view_id }` |
| PUT | `/api/v1/scada/views/:viewId` | `requireRole('admin','engineer')` | `Partial<View> & { expected_updated_at? }` | `{ success, updated_at }` |
| DELETE | `/api/v1/scada/views/:viewId` | `requireRole('admin','engineer')` | — | `{ success }` |

### 按罐查询

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/api/v1/scada/reactors/:reactorId/views` | `requireAuth` | `{ items: ViewMeta[] }` (本罐 + 通用) |

### 响应类型

```ts
interface ProjectMeta {
  project_id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface ViewMeta {
  view_id: string;
  project_id: string;
  name: string;
  reactor_id: string | null;
  display_order: number;
  width: number;
  height: number;
  background: string;
  updated_at: string;
}

interface View extends ViewMeta {
  items: ItemsJson;       // parsed from items_json
}
```

## 3. WebSocket 事件

复用 `packages/server/src/ws-server.ts` 的 `broadcast(channel, payload)`。

| Channel | Payload | 触发 |
|---|---|---|
| `scada:project:saved` | `{ project_id, updated_at }` | POST/PUT 项目成功后 |
| `scada:project:deleted` | `{ project_id }` | DELETE 项目成功后 |
| `scada:view:saved` | `{ view_id, project_id, updated_at, updated_by }` | POST/PUT 视图成功后 |
| `scada:view:deleted` | `{ view_id, project_id }` | DELETE 视图成功后 |

**冲突策略**: PUT 视图请求体可选带 `expected_updated_at` (字符串, SQLite 原格式 `"YYYY-MM-DD HH:MM:SS"`, 即上次 GET 返回的 `updated_at`)。若不匹配数据库当前值, 返 409 `{ error: 'concurrent_update', current_updated_at }`。客户端可选忽略 (强制覆盖, 不带此字段或带 `null`)。MVP 不做 OT/CRDT。

**ID 命名约定** (客户端责任, 后端只校验唯一性):
- `project_id` 前缀 `proj_` + `crypto.randomUUID()`
- `view_id` 前缀 `v_` + `crypto.randomUUID()` (与 FUXA 兼容)
- 后端 INSERT 时 `project_id` / `view_id` 必填, 重复返 409

## 4. 鉴权 + 审计

**Middleware** (复用):
- 所有读: `requireAuth`
- 所有写: `requireRole('admin', 'engineer')`
- operator 可读 (查看自己罐的画面), 不可写

**审计写入** (通过 `sqlite.writeAuditLog`):

| Action | target_type | target_id | old_value / new_value |
|---|---|---|---|
| `scada_project_create` | `scada_project` | project_id | `null` / `{name, description}` |
| `scada_project_update` | `scada_project` | project_id | 旧元数据 / 新元数据 |
| `scada_project_delete` | `scada_project` | project_id | `{name, view_count}` / `null` |
| `scada_view_create` | `scada_view` | view_id | `null` / `{name, reactor_id}` |
| `scada_view_save` | `scada_view` | view_id | `{updated_at: 旧值}` / `{updated_at: 新值, widget_count}` |
| `scada_view_delete` | `scada_view` | view_id | `{name}` / `null` |

`items_json` **不写入** audit (避免膨胀)。审计只记元数据变更证据。

**错误码**:

| 码 | 场景 |
|---|---|
| 400 | 请求体缺必填 / items_json 超 500KB / reactor_id 不存在于 reactor_configs |
| 401 | 无 JWT / token 过期 |
| 403 | 角色不足 |
| 404 | project_id / view_id 不存在 |
| 409 | `expected_updated_at` 不匹配 |
| 500 | DB 写失败 |

## 5. data-service 层

`packages/data-service/src/sqlite-service.ts` 新增方法:

```ts
// 项目
listScadaProjects(): ProjectMeta[]
getScadaProject(projectId: string): ProjectMeta | null
createScadaProject(p: { project_id, name, description?, created_by? }): void
updateScadaProject(projectId: string, patch: Partial<{ name, description }>): boolean
deleteScadaProject(projectId: string): { deleted_views: number }

// 视图
listScadaViewsByProject(projectId: string): ViewMeta[]
listScadaViewsByReactor(reactorId: string): ViewMeta[]   // includes NULL reactor_id (通用)
getScadaView(viewId: string): View | null                // parses items_json
createScadaView(v: { view_id, project_id, name, reactor_id?, width?, height?, items? }): void
updateScadaView(viewId: string, patch: Partial<View> & { expected_updated_at? }): { ok: true, updated_at } | { ok: false, conflict: true, current_updated_at }
deleteScadaView(viewId: string): boolean
```

items_json 在 service 层 `JSON.parse/stringify`, 路由层操作 `View.items` 对象。

## 6. 测试 + 验收

### 单元测试 — `packages/data-service/src/__tests__/scada-service.test.ts` (vitest)

- CRUD 闭环 (project + view 各自)
- items_json 序列化 round-trip — 复杂嵌套 widget 树
- `listScadaViewsByReactor('F01')` 返回 F01 + reactor_id=NULL 的视图
- cascade 删除 — 删项目后 views 不可达
- 并发冲突 — `expected_updated_at` 不匹配返 `conflict: true`

### 集成测试 — `packages/server/src/__tests__/scada-routes.test.ts` (supertest)

- 401 (无 token) / 403 (operator 写) / 200 (engineer 写)
- POST view → GET 返回最新 items
- DELETE project cascade
- audit_logs 记录写入验证
- WS broadcast 触发 (mock 监听器)
- malformed body 返 400, 不存在 ID 返 404

### 手工 DoD

1. `pnpm test` 全绿
2. curl + JWT 跑过全部 endpoint
3. `audit_logs` 查到 SCADA 操作行
4. 多浏览器 tab 监听 WS, PUT 视图后所有 tab 都收到 `scada:view:saved`
5. 重启 server, 视图持久化, items_json 解析无丢失
6. 不存在 view_id 返 404, malformed body 返 400

### 性能基线

| 操作 | 上限 |
|---|---|
| items_json 单 view | ≤ 500KB |
| `GET /scada/projects` (100 项目) | < 50ms |
| `GET /scada/views/:id` (单视图) | < 100ms |
| `PUT /scada/views/:id` (300KB items) | < 200ms |

## 7. 实施清单 (后续 writing-plans 输入)

1. 建 migration 028 (table + index)
2. data-service 加 10 个新方法 + 单测
3. scada-routes.ts 新建 + 注册到 index.ts
4. 集成测试覆盖
5. WS broadcast 接线
6. 审计追踪验证
7. README + API 文档片段

## 8. 风险 + 缓解

| 风险 | 缓解 |
|---|---|
| items_json 膨胀 (>500KB) | 后端检查长度, 超限拒绝 |
| 并发写覆盖 | `expected_updated_at` + 409 |
| reactor_id 引用完整性 | 写时校验 reactor_configs 存在 |
| FUXA 老数据迁移格式不兼容 | 子项目 6 单独处理, 不阻塞本子项目 |
| WS broadcast 风暴 (频繁保存) | 客户端 debounce 1s (前端责任, 不在后端) |

## 不做的事

- widget 类型定义 (前端契约, 子项目 3)
- 实时协同编辑 (OT/CRDT, 未来子项目)
- 版本控制 (审计已覆盖元数据快照, 未来按需加 scada_view_versions 表)
- 客户端 hook (子项目 2)
- 渲染层 (子项目 4)

## 参考

- FUXA 原 schema: `fuxa/appdata/project.fuxap.db` — `views(name TEXT PK, value TEXT JSON)`
- BIOCore 审计: `audit_logs` 表 + `sqlite.writeAuditLog()` + `useAudit` hook
- BIOCore WS: `packages/server/src/ws-server.ts` `broadcast(channel, payload)`
- BIOCore 鉴权: `packages/server/src/middlewares/auth.ts` `requireAuth` + `requireRole`
