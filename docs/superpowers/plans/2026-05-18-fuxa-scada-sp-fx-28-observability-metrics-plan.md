# SP-FX-28 执行计划: Observability / Prometheus Metrics

**日期**: 2026-05-18  
**Sprint**: SP-FX-28  
**Spec**: `docs/superpowers/specs/2026-05-18-fuxa-scada-sp-fx-28-observability-metrics-design.md`

---

## 任务清单

### T1: MetricsRegistry 核心实现 (TDD RED→GREEN)
- 文件: `packages/server/src/services/metrics.ts`
- 测试: `packages/server/src/__tests__/metrics.test.ts` (6-8 tests)
- 验证: counter.inc() / histogram.observe() / gauge.set() / serialize() 输出格式正确

### T2: metrics-routes (TDD RED→GREEN)
- 文件: `packages/server/src/metrics-routes.ts`
- 测试: `packages/server/src/__tests__/metrics-routes.test.ts` (3 tests)
- 验证: 无 auth 返回 401 / 有 admin token 返回 text/plain / counter 在输出中可见

### T3: metrics-middleware (TDD RED→GREEN)
- 文件: `packages/server/src/middlewares/metrics-middleware.ts`
- 测试: `packages/server/src/__tests__/metrics-middleware.test.ts` (3 tests)
- 验证: 请求后 http_requests_total 增加 / 延迟被记录 / path 取 route pattern

### T4: server/index.ts append 注入 (2 行)
- 在末尾 register metrics-routes + metrics-middleware
- 验证: route-registration 测试仍通过

### T5: audit log + write-intent metric 点注入
- audit-queue.ts 或 audit-log-routes.ts: audit_log_writes_total 计数
- 查找 write-intent handler 注入 write_intent_total{result}
- 验证: 对应 test 能看到计数器增长

### T6: docs/observability.md
- metric 名清单 + Grafana dashboard 推荐 query
- 不需要 test

### T7: 全量 vitest + tsc 验证
- 期望: ≥198 tests (188 + 10-15)
- 期望: tsc 无 error

---

## 成功标准

- [x] server vitest 188 → ≥198 全绿
- [x] GET /api/v1/metrics 返回 Prometheus text format
- [x] ZERO 新第三方 dep
- [x] 范围严格：不动 plc-driver / web-ui / data-service
