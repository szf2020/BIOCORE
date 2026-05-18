# SP-FX-47 紧急修复 — 执行计划

**Sprint**: SP-FX-47
**日期**: 2026-05-18
**执行顺序**: 安全修复 → CVE 文档

---

## 任务列表

### T1: Part 1 RED — AI suggestions 安全测试 (TDD RED-first)
- 写 `packages/server/src/__tests__/ai-suggestions-role-guard.test.ts`
- 3 个 endpoint × viewer 403 / operator 200 = 5 tests
- 预期：RED（无 requireRole 时测试失败）

### T2: Part 1 GREEN — 添加 requireRole
- `index.ts` 中 3 个 AI suggestions POST 路由加 `requireRole('operator', 'admin')`
- 运行测试 → GREEN

### T3: Part 2 RED — PLC 路由安全测试 (TDD RED-first)
- 写 `packages/server/src/__tests__/plc-role-guard.test.ts`
- 6 个 endpoint × non-admin 403 / admin 200 = 7-8 tests
- 预期：RED

### T4: Part 2 GREEN — 添加 requireRole('admin')
- `index.ts` 中 6 个 PLC 写操作路由加 `requireRole('admin')`
- 运行测试 → GREEN

### T5: Part 3 RED — WS timingSafeEqual 测试 (TDD RED-first)
- 写 `packages/server/src/__tests__/ws-timing-safe.test.ts`
- 测试 API Key hash 比对行为
- 预期：RED（当前用 ===）

### T6: Part 3 GREEN — 改用 timingSafeEqual
- `ws-server.ts` import `timingSafeEqual` from 'crypto'
- 替换字符串 `===` 比较为 timingSafeEqual 调用
- 运行测试 → GREEN

### T7: 全量回归 server
- `pnpm --filter @biocore/server test` 确认 0 fail, 数量 >= 286

### T8: 全量回归 web-ui
- `pnpm --filter @biocore/web-ui test` 确认 0 fail, 数量 >= 1221

### T9: Part 6 CVE 评估
- 跑 `pnpm audit`
- 写 `docs/cve-remediation-plan.md`

### T10: Commits + Push
- 各 part 独立 commit，rebase pull，push origin main

---

## 验收标准

- server tests: 0 fail, >= 286 + new tests
- web-ui tests: 0 fail, >= 1221
- AI suggestions 3 endpoints: viewer 403 / operator 200
- PLC 写操作 6 endpoints: non-admin 403 / admin 200
- ws-server.ts API Key 验证: timingSafeEqual
- CVE report: docs/cve-remediation-plan.md 存在
