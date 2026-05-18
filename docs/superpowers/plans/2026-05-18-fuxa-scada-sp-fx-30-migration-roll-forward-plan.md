# SP-FX-30 Migration Roll-Forward 端到端测试 — 执行计划

**日期**: 2026-05-18  
**Sprint**: SP-FX-30  
**设计文档**: `docs/superpowers/specs/2026-05-18-fuxa-scada-sp-fx-30-migration-roll-forward-design.md`

---

## 任务列表

### Task 1: Phase 2 — Spec 文档
- [x] 写 `docs/superpowers/specs/2026-05-18-fuxa-scada-sp-fx-30-migration-roll-forward-design.md`
- [x] commit

### Task 2: Phase 3 — Plan 文档 (本文件)
- [x] 写 `docs/superpowers/plans/2026-05-18-fuxa-scada-sp-fx-30-migration-roll-forward-plan.md`
- [x] commit

### Task 3: Phase 4 — 测试实现
- [ ] 写 `packages/server/src/__tests__/migration-roll-forward.test.ts`
  - T1: fresh DB roll-forward 001~035 全成功
  - T2: `_migrations` 表记录 35 条
  - T3: 关键表存在（users, audit_log, fuxa_views, scada_views, ai_suggestions）
  - T4: `fuxa_views` 列完整性
  - T5: `scada_views` 含 `owner_id` + `acl` 列
- [ ] 跑 `pnpm test` 验证 GREEN
- [ ] 写 `docs/migration-audit.md` 幂等性审计报告
- [ ] commit

### Task 4: Phase 5 — 全量 vitest + push
- [ ] 跑全量 server vitest（期望 188 + 3~5 新 = 191~193 pass）
- [ ] `git pull --rebase origin main`
- [ ] `git push origin main`

---

## 依赖与风险

| 风险 | 概率 | 缓解 |
|------|------|------|
| 某 migration SQL 在 fresh DB 失败 | 中 | T1 会精确定位失败的 migration |
| 035 `ALTER TABLE` 依赖 028 `scada_views` | 低 | 顺序执行已保障 |
| 025 `CREATE TABLE interlock_configs` 无 IF NOT EXISTS | 中 | 仅二次执行才触发，单次 roll-forward 无影响 |
| SP-FX-28 同目录并行写文件冲突 | 低 | 各自独立 `.test.ts` 文件 |

---

## 成功标准

1. `migration-roll-forward.test.ts` 全 5 tests PASS
2. 全量 server vitest >= 191 pass (188 基线 + 3 新)
3. `docs/migration-audit.md` 列出所有幂等性缺口文件
4. push 到 `origin/main` 成功
