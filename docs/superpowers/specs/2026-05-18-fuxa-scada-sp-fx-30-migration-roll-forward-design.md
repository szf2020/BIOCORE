# SP-FX-30 Migration Roll-Forward 端到端测试 — 设计文档

**日期**: 2026-05-18  
**Sprint**: SP-FX-30  
**状态**: 草稿

---

## 1. 背景

BIOCore server 现累积 35 个 migration 文件 (001~035)，覆盖从初始 schema 到 SCADA ACL 的全生命周期改动。这些 migration 从未经过 fresh DB roll-forward 端到端验证，存在以下风险：

- migration 顺序依赖断裂（如 029 依赖 028 的 `ai_suggestions` 表）
- 任一 SQL 文件语法错误
- `ALTER TABLE ADD COLUMN` 在二次执行时报错（列已存在）
- 表重建 migration（008, 013, 017, 025）在 intermediate state 失败后无法重试

---

## 2. 目标

- 验证 001~035 全 migration 可顺序从 fresh SQLite `:memory:` 数据库 roll-forward
- 验证 `_migrations` 表记录全部 35 条
- 验证关键表和列的 schema 完整性
- 审计幂等性缺口（不修改，仅报告）

---

## 3. 技术方案

### 3.1 测试框架

- **Vitest** + **better-sqlite3** `:memory:` DB
- 复用 `runMigrations()` 函数（`packages/server/src/migrator.ts`）
- Migration 目录路径: `packages/server/migrations/`

### 3.2 测试结构

```
packages/server/src/__tests__/migration-roll-forward.test.ts
```

包含 5 个测试:

| # | 名称 | 验证点 |
|---|------|--------|
| T1 | 全 35 migration 顺序执行成功 | `runMigrations()` 不抛异常 |
| T2 | `_migrations` 表记录 35 条 | `SELECT count(*) FROM _migrations` |
| T3 | 关键表存在 | `sqlite_master` 查 5 张关键表 |
| T4 | `fuxa_views` 列完整性 | `PRAGMA table_info` |
| T5 | `scada_views` 含 `owner_id` + `acl` 列 | `PRAGMA table_info` (035 加的列) |

### 3.3 关键表清单

| 表名 | 引入 migration | 说明 |
|------|---------------|------|
| `users` | 001 | 初始 baseline |
| `audit_log` | 034 | SP-FX-19 审计 |
| `fuxa_views` | 033 | FUXA view 存储 |
| `scada_views` | 028 | SCADA 视图 |
| `ai_suggestions` | 028 | AI 建议 (029 依赖) |

### 3.4 幂等性审计范围

- `CREATE TABLE` 无 `IF NOT EXISTS`: 迁移 025（`interlock_configs`）
- `ALTER TABLE ADD COLUMN` 无 guard: 003, 004, 005, 007, 010, 018, 021, 023, 024, 029, 030, 031, 032, 035
- 表重建模式（含 RENAME）: 008, 013, 017, 025 — 这些已有 `DROP TABLE IF EXISTS` 保护临时表

---

## 4. 设计决策

### D1: 使用 `runMigrations()` 而非手动 exec

优点: 真实测试生产路径（含 `_migrations` tracking）  
缺点: 引入 umzug 依赖（已有，非新增）

### D2: fresh `:memory:` DB（不模拟旧数据库）

目标是验证 fresh DB roll-forward，不测 baseline 兼容路径（已有独立测试）

### D3: 幂等性审计仅报告不修改

按 SP-FX-30 范围约束。二次执行保护是 SP-FX-31+ 的工作。

---

## 5. 文件范围

| 文件 | 操作 |
|------|------|
| `packages/server/src/__tests__/migration-roll-forward.test.ts` | 新建 |
| `docs/migration-audit.md` | 新建（幂等性审计报告） |
| `docs/superpowers/specs/2026-05-18-fuxa-scada-sp-fx-30-migration-roll-forward-design.md` | 本文件 |
| `docs/superpowers/plans/2026-05-18-fuxa-scada-sp-fx-30-migration-roll-forward-plan.md` | 新建 |

**不修改**: 任何 migration SQL / server 源代码 / web-ui / data-service / plc-driver
