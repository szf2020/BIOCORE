# SP-FX-42 Alert Notification System — 实施计划

**Sprint**: SP-FX-42  
**日期**: 2026-05-18  
**Spec**: docs/superpowers/specs/2026-05-18-fuxa-scada-sp-fx-42-alert-notification-design.md

---

## 任务列表

| # | 任务 | 文件 | 验证 |
|---|------|------|------|
| T1 | 创建 migration 037-alert-tables.sql | migrations/037-alert-tables.sql | SQL 无语法错误，3 表存在 |
| T2 | alert-routes.ts — 全部 CRUD + test/:channelId | src/alert-routes.ts | 6-8 tests GREEN |
| T3 | alert-dispatcher.ts — 3 adapter + retry | src/services/alert-dispatcher.ts | 4-6 tests GREEN |
| T4 | server/index.ts — 末尾 append registerAlertRoutes | src/index.ts (末尾 append) | tsc 无报错 |
| T5 | migration-roll-forward 更新测试 | src/__tests__/migration-roll-forward.test.ts | 新 T7 GREEN |
| T6 | web-ui alerts/page.tsx — 3 tab 页面 | web-ui/src/app/scada2/alerts/page.tsx | 8-10 tests GREEN |
| T7 | docs/alerts-setup.md | docs/alerts-setup.md | 文件存在，内容完整 |
| T8 | 全量测试 + push | — | server +15-18, web-ui +8-10 |

---

## 执行顺序

T1 → T2 (TDD) → T3 (TDD) → T4 → T5 → T6 (TDD) → T7 → T8

---

## TDD 节律

每个 task:
1. RED: 先写测试，run → FAIL
2. GREEN: 最小实现 → PASS
3. COMMIT

---

## 风险

- migration 编号冲突 (037) — 并行 agent 若也用 037 → 改为 038
- index.ts 末尾 append 与 SP-FX-43 race — 各自 rebase 解决
