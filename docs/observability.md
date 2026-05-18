# BIOCore 可观测性指南 (SP-FX-28)

## Metrics Endpoint

```
GET /api/v1/metrics
Authorization: Bearer <admin-token>
```

返回 `Content-Type: text/plain; version=0.0.4; charset=utf-8` (Prometheus exposition format)。

**权限**: 需要 `admin` 角色。生产环境建议额外配置 reverse-proxy IP 白名单（仅允许 Prometheus scraper IP）。

---

## Metric 清单

### HTTP 请求

| Metric | Type | Labels | 说明 |
|--------|------|--------|------|
| `http_requests_total` | counter | `method`, `path`, `status` | 所有 HTTP 请求计数（path 为 Express route pattern） |
| `http_request_duration_seconds` | histogram | `method`, `path` | 请求延迟（buckets: 0.01, 0.05, 0.1, 0.5, 1, 5 秒） |

### WriteIntent (AI 建议)

| Metric | Type | Labels | 说明 |
|--------|------|--------|------|
| `write_intent_total` | counter | `result` (`accept` / `reject`) | 操作员 accept/reject AI 写入建议次数 |

### Audit Log

| Metric | Type | Labels | 说明 |
|--------|------|--------|------|
| `audit_log_writes_total` | counter | — | 成功写入 SQLite audit_logs 表的条目数 |

---

## 输出示例

```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",path="/api/v1/batches",status="200"} 142
http_requests_total{method="POST",path="/api/v1/scada/write-intent",status="200"} 28

# HELP http_request_duration_seconds HTTP request duration in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.01"} 87
http_request_duration_seconds_bucket{le="0.05"} 134
http_request_duration_seconds_bucket{le="0.1"} 141
http_request_duration_seconds_bucket{le="0.5"} 142
http_request_duration_seconds_bucket{le="1"} 142
http_request_duration_seconds_bucket{le="5"} 142
http_request_duration_seconds_bucket{le="+Inf"} 142
http_request_duration_seconds_sum 3.2145
http_request_duration_seconds_count 142

# HELP write_intent_total WriteIntent accept/reject count
# TYPE write_intent_total counter
write_intent_total{result="accept"} 24
write_intent_total{result="reject"} 4

# HELP audit_log_writes_total Total number of audit log entries written to SQLite
# TYPE audit_log_writes_total counter
audit_log_writes_total 312
```

---

## Prometheus 配置

`prometheus.yml` 追加 scrape job:

```yaml
scrape_configs:
  - job_name: biocore
    scrape_interval: 15s
    static_configs:
      - targets: ['biocore-server:3001']
    metrics_path: /api/v1/metrics
    authorization:
      type: Bearer
      credentials: '<admin-api-key>'
```

---

## Grafana 推荐 Query

### HTTP 请求速率 (req/s)

```promql
rate(http_requests_total[5m])
```

### P95 请求延迟

```promql
histogram_quantile(0.95,
  rate(http_request_duration_seconds_bucket[5m])
)
```

### WriteIntent accept rate

```promql
rate(write_intent_total{result="accept"}[10m])
  /
(rate(write_intent_total{result="accept"}[10m]) + rate(write_intent_total{result="reject"}[10m]))
```

### Audit log 写入速率

```promql
rate(audit_log_writes_total[5m])
```

### 错误率 (4xx + 5xx)

```promql
sum(rate(http_requests_total{status=~"[45].."}[5m]))
  /
sum(rate(http_requests_total[5m]))
```

---

## 架构说明

- `packages/server/src/services/metrics.ts`: MetricsRegistry 单例，ZERO 第三方依赖，纯 TypeScript 实现
- `packages/server/src/metrics-routes.ts`: GET /api/v1/metrics 路由
- `packages/server/src/middlewares/metrics-middleware.ts`: HTTP 拦截 middleware（hrtime 精度）
- `packages/server/src/audit-queue.ts`: drain 成功后累加 `audit_log_writes_total`
- `packages/server/src/index.ts`: accept/reject handler 累加 `write_intent_total`
