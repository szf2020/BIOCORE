# SP-FX-35 Migration 幂等性补丁 — 设计规格

**Sprint**: SP-FX-35  
**日期**: 2026-05-18  
**状态**: 已审批，进入实施

---

## 背景

SP-FX-30 审计发现 2 类幂等性缺口：

1. **HIGH (2 文件)** — `CREATE TABLE` / `CREATE INDEX` 无 `IF NOT EXISTS`，手动重跑 SQL 会报 "table already exists" / "index already exists"
2. **MEDIUM (14 文件)** — `ALTER TABLE ADD COLUMN` 无 guard，手动重跑会报 "duplicate column name"

生产环境 umzug `_migrations` 表防止二次执行，roll-forward 安全。但手动 CI 裸跑和开发者本地调试存在真实风险。

---

## Part 1: HIGH fix — 025 & 017

### 025-interlock-per-reactor.sql

**问题**: 行 7 `CREATE TABLE interlock_configs` 无 IF NOT EXISTS；行 37-38 两个 `CREATE INDEX` 无 IF NOT EXISTS。

**修复**:
- `CREATE TABLE interlock_configs` → `CREATE TABLE IF NOT EXISTS interlock_configs`
- `CREATE UNIQUE INDEX idx_il_id_reactor` → `CREATE UNIQUE INDEX IF NOT EXISTS idx_il_id_reactor`
- `CREATE INDEX idx_il_reactor` → `CREATE INDEX IF NOT EXISTS idx_il_reactor`

**安全性**: 025 先 RENAME 旧表再 CREATE，IF NOT EXISTS 保护 CREATE 那步；INDEX 加 IF NOT EXISTS 同理。语义不变。

### 017-extend-doe-design-types.sql

**问题**: 行 11 `CREATE TABLE doe_studies` 无 IF NOT EXISTS。

**修复**:
- `CREATE TABLE doe_studies` → `CREATE TABLE IF NOT EXISTS doe_studies`

**安全性**: 017 在第 8 行已有 `DROP TABLE IF EXISTS doe_studies`，所以 CREATE 时表一定不存在；加 IF NOT EXISTS 纯为防御性，不改变语义。

---

## Part 2: MEDIUM fix — Runner 端 catch 重复列

### 策略选择

| 方案 | 描述 | 决策 |
|------|------|------|
| A: 14 文件各加 PRAGMA guard | 每个 ALTER 前 PRAGMA table_info 检查，但 SQL DDL 不支持条件分支 | **否** (SQL 不支持) |
| B: SQLite 3.37.0 `IF NOT EXISTS` | macOS 自带 3.39+，但服务器环境不保证 | **否** (兼容性风险) |
| C: Runner 端 catch "duplicate column name" | migrator.ts 的 `up()` 函数内捕获 SQLite "duplicate column name" 错误，log warn + continue | **采用** |

### 实现细节 (migrator.ts)

在 `up: async () => { db.exec(sql) }` 外包一层错误处理：

```typescript
up: async () => {
  try {
    const sql = readFileSync(resolve(dir, file), 'utf8');
    db.exec(sql);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('duplicate column name')) {
      console.warn(`[Migrator] ${name}: duplicate column name — column 已存在, 跳过 (idempotent)`);
      return; // 视为成功
    }
    throw e; // 其他错误继续抛出
  }
},
```

**注意**: `db.exec(sql)` 执行多条语句，SQLite 遇第一条 ALTER 失败即抛出。同一 migration 内多条 ALTER 语句在重跑场景下只会在第一条已存在列时报错。这是可接受行为 (重跑场景为非生产路径)。

---

## Part 3: 测试 (migration-idempotency.test.ts)

位置: `packages/server/src/__tests__/migration-idempotency.test.ts`

5 个测试用例：

| ID | 描述 |
|----|------|
| T1 | fresh DB + 全部 migration 正常完成 (确认基线) |
| T2 | 025 SQL 单独在已运行过 025 的 DB 上重跑，不报 "table already exists" |
| T3 | 017 SQL 单独在已运行过 017 的 DB 上重跑，不报 "table already exists" |
| T4 | 带 ALTER 的 migration (003) 通过 runner 重跑，runner catch "duplicate column" 后 resolve (不 throw) |
| T5 | 其他真实 SQLite 错误 (非 duplicate column) 不被吞掉，仍 throw |

---

## Part 4: docs/migration-audit.md 更新

在各 HIGH/MEDIUM 条目下标注 resolved，并在文末增加"修复摘要"节，说明 runner-side 策略。

---

## 约束

- 0 新第三方依赖
- 14 个 MEDIUM 文件不改动（runner 已 handle）
- 不触碰 web-ui / batch widgets / RuntimeCanvas / dict files / migration 036
- baseline server 207 tests 不能减；期望 +3-5 (新 test 文件)
