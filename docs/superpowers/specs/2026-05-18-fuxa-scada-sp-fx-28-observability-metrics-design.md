# SP-FX-28 设计规格: Observability / Prometheus Metrics

**日期**: 2026-05-18  
**Sprint**: SP-FX-28  
**状态**: DRAFT

---

## 1. 背景与目标

BIOCore 目前无监控 endpoint。生产部署前需暴露标准 Prometheus metrics，支持 Grafana 接入。

**目标**:
- 暴露 HTTP 请求计数 / 延迟
- WriteIntent accept/reject 计数
- WS / SSE connection 数
- audit log 写入 rate
- 全部 ZERO 新第三方依赖（不引 prom-client）

---

## 2. 架构决策

### 2.1 自写 MetricsRegistry (ZERO dep)

不引入 prom-client，自实现 Prometheus text exposition format 输出。

**数据结构**:
- Counter: `Map<labelKey, number>` 单调递增
- Histogram: sum + count + buckets `[0.01, 0.05, 0.1, 0.5, 1, 5]`
- Gauge: `Map<labelKey, number>` 可任意设置

**输出格式** (Prometheus text format v0.0.4):
```
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",path="/api/v1/batches",status="200"} 42
```

### 2.2 Singleton 模式

`services/metrics.ts` 导出单例 `metricsRegistry`，所有注入点共享同一实例。

### 2.3 路由: GET /api/v1/metrics

安全策略: `requireRole('admin')` (安全优先，生产 reverse-proxy 可进一步限制)。

返回 `Content-Type: text/plain; version=0.0.4; charset=utf-8`。

### 2.4 HTTP middleware

使用 `res.on('finish', ...)` 拦截响应，避免 body streaming 影响。  
path 规范化: 用 `req.route?.path || req.path` 取 Express route pattern，避免 cardinality 爆炸。

---

## 3. Metric 名称清单

| Metric | Type | Labels | 说明 |
|--------|------|--------|------|
| `http_requests_total` | counter | method, path, status | HTTP 请求计数 |
| `http_request_duration_seconds` | histogram | method, path | 请求延迟 |
| `write_intent_total` | counter | result (accept/reject) | WriteIntent 结果计数 |
| `websocket_connections_active` | gauge | — | 当前 WS 连接数 |
| `sse_connections_active` | gauge | — | 当前 SSE 连接数 |
| `audit_log_writes_total` | counter | — | audit log 写入总数 |

---

## 4. 文件范围

| 文件 | 操作 |
|------|------|
| `packages/server/src/services/metrics.ts` | 新建: MetricsRegistry 实现 |
| `packages/server/src/metrics-routes.ts` | 新建: GET /api/v1/metrics |
| `packages/server/src/middlewares/metrics-middleware.ts` | 新建: HTTP metrics 拦截 |
| `packages/server/src/index.ts` | 末尾 append 2 行 register |
| `docs/observability.md` | 新建: 使用文档 |
| `packages/server/src/__tests__/metrics.test.ts` | 新建: 6-8 tests |
| `packages/server/src/__tests__/metrics-routes.test.ts` | 新建: 3 tests |
| `packages/server/src/__tests__/metrics-middleware.test.ts` | 新建: 3 tests |

---

## 5. 约束确认

- ZERO 新第三方 dep ✓
- TDD RED-first ✓
- 不动 plc-driver / web-ui / data-service ✓
- baseline server 188 不减，期望 +10-15 ✓
- 安全: requireRole('admin') ✓
