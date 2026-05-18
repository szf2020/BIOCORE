# SP-FX-38 设计规格: Grafana Dashboard — BIOCore Overview

**日期**: 2026-05-18
**Sprint**: SP-FX-38
**状态**: APPROVED (自治执行)

---

## 1. 背景与目标

SP-FX-28 已在 `/api/v1/metrics` 暴露 4 个 Prometheus metric。本 sprint 构建 Grafana dashboard JSON + 完整 provisioning 配置，实现 observability stack 一键启动。

**目标**:
- `grafana/dashboards/biocore-overview.json` — 覆盖 4 个核心 SP-FX-28 metric 的 dashboard
- `grafana/provisioning/dashboards/biocore.yml` — Grafana 自动加载 dashboard
- `grafana/provisioning/datasources/prometheus.yml` — Grafana 数据源配置
- `prometheus/prometheus.yml` — 独立 scrape 配置（bearer token 安全）
- `docs/observability-setup.md` — 操作文档
- 1-2 个 JSON schema vitest 验证测试

---

## 2. Metric 清单 (SP-FX-28 实际实现)

| Metric | Type | Labels | 来源 |
|--------|------|--------|------|
| `http_requests_total` | counter | `method`, `path`, `status` | metrics-middleware.ts |
| `http_request_duration_seconds` | histogram | `method`, `path` | metrics-middleware.ts |
| `write_intent_total` | counter | `result` (accept/reject) | index.ts |
| `audit_log_writes_total` | counter | — | audit-queue.ts |
| `biocore_ws_connections` | gauge | — | 已有（runtime panel） |

**注**: SSE connections / DB query rate 无对应 metric，不在 dashboard 中引用。

---

## 3. Dashboard 设计 (biocore-overview.json)

### 3.1 Dashboard 变量

| 变量 | 类型 | 说明 |
|------|------|------|
| `$instance` | query (label_values) | server 实例主机名 |
| `$interval` | interval | rate 窗口 (1m/5m/15m) |

### 3.2 Panel 布局 (11 panels，总宽 24)

**Row 1: HTTP 请求速率 (y=0)**

| # | 标题 | 类型 | 宽 | PromQL |
|---|------|------|----|--------|
| 1 | HTTP 请求速率 (req/s) | timeseries | 12 | `rate(http_requests_total[$__rate_interval])` by path |
| 2 | HTTP 错误率 (5xx/s) | timeseries | 12 | `rate(http_requests_total{status=~"5.."}[$__rate_interval])` by path |

**Row 2: HTTP 延迟 (y=8)**

| # | 标题 | 类型 | 宽 | PromQL |
|---|------|------|----|--------|
| 3 | 请求延迟 p50 | timeseries | 8 | `histogram_quantile(0.5, rate(http_request_duration_seconds_bucket[$__rate_interval]))` by path |
| 4 | 请求延迟 p95 | timeseries | 8 | `histogram_quantile(0.95, ...)` by path |
| 5 | 请求延迟 p99 | timeseries | 8 | `histogram_quantile(0.99, ...)` by path |

**Row 3: Write Intent (y=16)**

| # | 标题 | 类型 | 宽 | PromQL |
|---|------|------|----|--------|
| 6 | WriteIntent 速率 | timeseries | 12 | `rate(write_intent_total[$__rate_interval])` by result |
| 7 | WriteIntent accept 率 | stat | 12 | accept / (accept+reject) × 100 |

**Row 4: Audit Log + WS (y=24)**

| # | 标题 | 类型 | 宽 | PromQL |
|---|------|------|----|--------|
| 8 | Audit Log 写入速率 | timeseries | 12 | `rate(audit_log_writes_total[$__rate_interval])` |
| 9 | Audit Log 累计写入 | stat | 6 | `audit_log_writes_total` |
| 10 | Active WS Connections | stat | 6 | `biocore_ws_connections` |

**Row 5: 汇总 (y=32)**

| # | 标题 | 类型 | 宽 | PromQL |
|---|------|------|----|--------|
| 11 | 总请求数 (累计) | stat | 24 | `sum(http_requests_total)` |

---

## 4. 目录结构

```
grafana/                           ← 新目录
  dashboards/
    biocore-overview.json          ← 新建
  provisioning/
    dashboards/
      biocore.yml                  ← 新建
    datasources/
      prometheus.yml               ← 新建

prometheus/                        ← 新目录
  prometheus.yml                   ← 新建

docs/
  observability-setup.md           ← 新建

packages/server/src/__tests__/
  grafana-dashboard.test.ts        ← 新建 (JSON schema 验证)
```

---

## 5. 约束确认

- ZERO 新第三方依赖
- 不触碰 packages/* 源代码（测试文件除外，属于测试范畴）
- 不触碰 migrations / dict files / nginx config
- 测试仅验证 JSON 结构，不走 RED
