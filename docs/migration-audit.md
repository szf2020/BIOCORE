# BIOCore Migration 幂等性审计报告

**审计日期**: 2026-05-18  
**Sprint**: SP-FX-30  
**审计范围**: `packages/server/migrations/001~035-*.sql` (共 34 个文件, 006 缺失)  
**审计方式**: 静态 grep 分析 + fresh DB roll-forward 验证  
**修改范围**: 仅报告, 不修改任何 migration 文件

---

## 执行摘要

| 类别 | 数量 | 风险级别 |
|------|------|---------|
| `CREATE TABLE` 无 `IF NOT EXISTS` (非临时表) | 2 | HIGH |
| `CREATE INDEX` 无 `IF NOT EXISTS` | 2 | HIGH |
| `ALTER TABLE ADD COLUMN` 无 guard | 14 | MEDIUM |
| 表重建模式 (DROP + CREATE, 含保护) | 4 | LOW (已有 guard) |

**Roll-forward 结果**: 34 个 migration 从 fresh `:memory:` DB 顺序执行全部成功（vitest T1~T5 GREEN）。  
幂等性缺口不影响首次 roll-forward，但二次重跑同一 migration 会失败。

---

## HIGH: `CREATE TABLE` 无 `IF NOT EXISTS`

这些表在二次执行时会因 "table already exists" 报错。

### 025-interlock-per-reactor.sql (行 7)

```sql
CREATE TABLE interlock_configs (
  id   TEXT NOT NULL,
  ...
);
```

**问题**: 第 5 行先 `RENAME` 旧表，第 7 行 `CREATE TABLE` 无 `IF NOT EXISTS`。  
**场景**: migration runner 已记录 025 为 executed，若手动重跑裸 SQL 则会因 `interlock_configs` 已存在报错。  
**缓解现状**: umzug `_migrations` 表防止二次执行（生产安全），但手动测试或 CI 裸 SQL 重跑有风险。

**✅ SP-FX-35 resolved**: `CREATE TABLE` → `CREATE TABLE IF NOT EXISTS`。

### 017-extend-doe-design-types.sql (行 11)

```sql
CREATE TABLE doe_studies (
  study_id TEXT PRIMARY KEY,
  ...
);
```

**问题**: 行 8 有 `DROP TABLE IF EXISTS doe_studies`（已删旧表），但 `CREATE TABLE` 本身仍无 `IF NOT EXISTS`。  
**场景**: 若 `DROP TABLE IF EXISTS` 因 FK 约束跳过，而 `CREATE TABLE` 又无 guard，会报错。  
**缓解现状**: 017 执行时尚无外键约束引用 `doe_studies`，实际 roll-forward 无问题。

**✅ SP-FX-35 resolved**: `CREATE TABLE doe_studies` → `CREATE TABLE IF NOT EXISTS doe_studies`。

---

## HIGH: `CREATE INDEX` 无 `IF NOT EXISTS`

### 025-interlock-per-reactor.sql (行 37-38)

```sql
CREATE UNIQUE INDEX idx_il_id_reactor ON interlock_configs(id, IFNULL(reactor_id, '__global__'));
CREATE INDEX idx_il_reactor ON interlock_configs(reactor_id);
```

**问题**: 二次执行报 "index already exists"。  
**与上同**: 025 的整体幂等性均有问题，建议一并修复。

**✅ SP-FX-35 resolved**: `CREATE UNIQUE INDEX` → `CREATE UNIQUE INDEX IF NOT EXISTS`；`CREATE INDEX` → `CREATE INDEX IF NOT EXISTS`。

---

## MEDIUM: `ALTER TABLE ADD COLUMN` 无 guard

SQLite `ALTER TABLE ADD COLUMN` 不支持 `IF NOT EXISTS`（SQLite < 3.37.0）。二次执行报 "duplicate column name"。  
受影响文件（共 14 个）：

| 文件 | 影响列 |
|------|--------|
| `003-add-trace-fields.sql` | `audit_logs.trace_id` |
| `004-extend-offline-samples.sql` | `offline_samples.lactate_g_L` 等 4 列 |
| `005-add-reactor-category.sql` | `reactor_configs.category` |
| `007-add-recipe-v2-fields.sql` | `recipes.dag_schema_version` 等 5 列 |
| `010-enhance-offline-samples.sql` | `offline_samples.updated_at` 等 3 列 |
| `018-doe-optimal-recipe.sql` | `doe_studies.optimal_recipe_id` 等 4 列 |
| `021-ai-report-sessions.sql` | `ai_sessions.session_type` 等 4 列 |
| `023-batch-current-node.sql` | `batches.current_node_id`, `audit_logs.target_kind` |
| `024-batch-loop-frames.sql` | `batches.current_loop_frames` |
| `029-scada-dispatch.sql` | `ai_suggestions.dispatch_status` 等 4 列 |
| `030-scada-view-svg-flag.sql` | `scada_views.is_svg` |
| `031-scada-view-template-flag.sql` | `scada_views.is_template` |
| `032-ai-suggestion-suggested-value-raw.sql` | `ai_suggestions.suggested_value_raw` |
| `035-view-acl.sql` | `scada_views.owner_id`, `scada_views.acl` |

**缓解建议** (SP-FX-31+): 使用 SQLite 3.37.0+ 的 `ALTER TABLE ADD COLUMN IF NOT EXISTS`，或封装为表重建 guard 脚本。

**✅ SP-FX-35 resolved (runner-side)**: 14 个文件不修改。`packages/server/src/migrator.ts` 的 `up()` 函数现在捕获 SQLite "duplicate column name" 错误，log warn 后 return（视为幂等成功）。其他 SQLite 错误仍正常 throw。migration 文件 SQL 语义不变，生产路径不受影响。

---

## LOW: 表重建模式（已有 guard）

这些 migration 使用 DROP+CREATE 重建表，但已有适当的保护措施：

| 文件 | 临时表保护 | 数据保护 |
|------|-----------|---------|
| `008-recipe-status-pending.sql` | `DROP TABLE IF EXISTS _recipes_new` | INSERT FROM recipes |
| `013-recipe-deprecation.sql` | `DROP TABLE IF EXISTS _recipes_new` | INSERT INTO _recipes_new |
| `017-extend-doe-design-types.sql` | `CREATE TABLE IF NOT EXISTS doe_studies_backup` | `INSERT OR IGNORE` |
| `025-interlock-per-reactor.sql` | RENAME to `interlock_configs_old` | INSERT FROM _old |

---

## 建议修复优先级 (供 SP-FX-31)

| 优先级 | 文件 | 修复方式 |
|--------|------|---------|
| P1 | `025-interlock-per-reactor.sql` | `CREATE TABLE IF NOT EXISTS` + `CREATE UNIQUE INDEX IF NOT EXISTS` |
| P2 | 14 个 ALTER 文件 | 升级 SQLite 使用 `ALTER TABLE ADD COLUMN IF NOT EXISTS` (SQLite 3.37.0+) |
| P3 | `017-extend-doe-design-types.sql` | `CREATE TABLE IF NOT EXISTS doe_studies` (第 11 行) |

---

## SP-FX-35 修复摘要 (2026-05-18)

**Sprint**: SP-FX-35 — Migration 幂等性补丁

### 修复文件

| 文件 | 修复类型 | 具体更改 |
|------|---------|---------|
| `025-interlock-per-reactor.sql` | HIGH — SQL 文件 | `CREATE TABLE` → `CREATE TABLE IF NOT EXISTS`；两个 `CREATE INDEX` → `CREATE INDEX IF NOT EXISTS` |
| `017-extend-doe-design-types.sql` | HIGH — SQL 文件 | `CREATE TABLE doe_studies` → `CREATE TABLE IF NOT EXISTS doe_studies` |
| `packages/server/src/migrator.ts` | MEDIUM — Runner | `up()` 函数捕获 "duplicate column name" 错误，log warn + return（14 个 ALTER 文件无需修改） |

### 策略说明

MEDIUM 级 14 个 ALTER TABLE 文件采用 **runner-side catch** 策略，而非修改 SQL 文件：

- SQLite DDL 不支持条件分支，无法在纯 SQL 层面实现幂等 ALTER
- 服务器环境 SQLite 版本不统一，不强依赖 3.37.0 的 `IF NOT EXISTS` 语法
- `_migrations` 表已防止生产重跑，catch 仅保护手动/测试重跑场景
- 14 个 migration 文件语义不变，diff 为零

### 测试覆盖

新增 `packages/server/src/__tests__/migration-idempotency.test.ts` — 5 个测试全 GREEN：

- T1: fresh DB roll-forward 基线确认
- T2: 025 重跑不报 "table/index already exists"
- T3: 017 CREATE TABLE IF NOT EXISTS 防御性验证
- T4: 含 ALTER 的 migration 通过 runner 重跑不 throw
- T5: 非 duplicate-column 错误（如 UNIQUE constraint）仍正常 throw

---

## 注意事项

- **生产风险**: umzug `_migrations` 表防止二次执行，生产环境 roll-forward 安全。
- **CI 风险**: 若 CI 每次从 fresh DB 跑，单次 roll-forward 无问题（T1 GREEN 证明）。
- **手动测试风险**: 若开发者手动复制 SQL 文件裸跑，HIGH 级问题文件会失败。
- **SQLite 版本**: macOS Ventura+ 自带 SQLite 3.39+，支持 `ALTER TABLE ADD COLUMN IF NOT EXISTS`。
