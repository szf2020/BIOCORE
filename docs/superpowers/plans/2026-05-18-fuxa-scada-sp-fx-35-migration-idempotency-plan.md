# SP-FX-35 Migration 幂等性补丁 — 实施计划

**Sprint**: SP-FX-35  
**日期**: 2026-05-18  
**关联 Spec**: `docs/superpowers/specs/2026-05-18-fuxa-scada-sp-fx-35-migration-idempotency-design.md`

---

## 任务清单

### Task 1: TDD RED — 先写测试 (migration-idempotency.test.ts)
- 创建 `packages/server/src/__tests__/migration-idempotency.test.ts`
- 5 个测试用例 (T1~T5)
- 验证: `pnpm --filter @biocore/server test` 显示 RED (T2~T5 失败)

### Task 2: HIGH fix — 025-interlock-per-reactor.sql
- `CREATE TABLE interlock_configs` → `CREATE TABLE IF NOT EXISTS interlock_configs`
- `CREATE UNIQUE INDEX idx_il_id_reactor` → `CREATE UNIQUE INDEX IF NOT EXISTS idx_il_id_reactor`
- `CREATE INDEX idx_il_reactor` → `CREATE INDEX IF NOT EXISTS idx_il_reactor`
- 验证: T2 GREEN

### Task 3: HIGH fix — 017-extend-doe-design-types.sql + Runner MEDIUM fix (migrator.ts)
- `CREATE TABLE doe_studies` → `CREATE TABLE IF NOT EXISTS doe_studies`
- migrator.ts `up()` 外包 try-catch，catch "duplicate column name" → warn + return
- 验证: T3, T4, T5 GREEN

### Task 4: 更新 docs/migration-audit.md + 全量验证 + push
- 标 HIGH/MEDIUM 文件 resolved
- 增加"SP-FX-35 修复摘要"节
- `pnpm --filter @biocore/server test` 全绿 (207+ tests)
- `git pull --rebase origin main && git push origin main`

---

## 成功标准

- [ ] 017 / 025 SQL 文件手动重跑不报错
- [ ] migrator.ts catch duplicate column，不再 throw
- [ ] 5 个新测试全 GREEN
- [ ] server vitest >= 212 (基线 207 + 新 5)
- [ ] migration-audit.md 标注 resolved
