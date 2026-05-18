# BIOCore Observability Stack 启动指南 (SP-FX-38)

## 概览

本文档说明如何启动 Prometheus + Grafana observability stack，一键 import BIOCore Overview dashboard，并提供推荐 PromQL 查询列表。

**端口**:
- Grafana: http://localhost:3002 (admin / biocore_admin)
- Prometheus: http://localhost:9090

---

## 前置条件

1. Docker + Docker Compose 已安装
2. BIOCore 主服务已启动（或与 observability profile 一起启动）
3. 准备一个 admin 角色的 API key（用于 Prometheus 抓取鉴权）

---

## 启动步骤

### 1. 设置环境变量

```bash
# 替换为实际的 admin API key
export METRICS_AUTH_TOKEN="your-admin-api-key"
```

### 2. 启动 observability stack

```bash
# 与 BIOCore 主服务一起启动（推荐）
docker compose \
  -f docker-compose.yml \
  -f docker-compose.observability.yml \
  --profile observability \
  up -d

# 或仅启动 observability（假设 BIOCore 已在运行）
docker compose \
  -f docker-compose.observability.yml \
  --profile observability \
  up -d
```

### 3. 验证服务健康

```bash
# Prometheus 健康检查
curl http://localhost:9090/-/healthy

# 检查 BIOCore scrape target 是否 UP
curl -s http://localhost:9090/api/v1/targets | python3 -m json.tool | grep '"health"'

# 手动测试 metrics endpoint
curl -H "Authorization: Bearer $METRICS_AUTH_TOKEN" \
  http://localhost:3001/api/v1/metrics | head -20
```

---

## Grafana Dashboard 一键 Import

Grafana 通过 provisioning 自动加载 dashboard，**无需手动 import**。

启动后访问 http://localhost:3002，在 **Dashboards → BIOCore** 文件夹中即可找到:
- **BIOCore Overview (SP-FX-28)** — SP-FX-38 新增的 overview dashboard

### 手动 Import（可选）

若需手动导入或更新:

1. 打开 Grafana → Dashboards → Import
2. 上传 `grafana/dashboards/biocore-overview.json`
3. 选择 Prometheus 数据源
4. 点击 Import

---

## Dashboard Panels 说明

| Panel | Metric | 说明 |
|-------|--------|------|
| HTTP 请求速率 (req/s) by path | `http_requests_total` | 各路由每秒请求数 |
| HTTP 5xx 错误速率 by path | `http_requests_total{status=~"5.."}` | 5xx 错误速率 |
| 请求延迟 p50 by path | `http_request_duration_seconds` | p50 延迟 by 路由 |
| 请求延迟 p95 by path | `http_request_duration_seconds` | p95 延迟 by 路由 |
| 请求延迟 p99 by path | `http_request_duration_seconds` | p99 延迟 by 路由 |
| WriteIntent 速率 by result | `write_intent_total` | AI 建议 accept/reject 速率 |
| WriteIntent Accept 率 (%) | `write_intent_total` | 操作员接受 AI 建议比率 |
| Audit Log 写入速率 | `audit_log_writes_total` | SQLite audit_logs 写入速率 |
| Audit Log 累计写入 | `audit_log_writes_total` | 累计写入条目数 |
| Active WS Connections | `biocore_ws_connections` | 当前 WebSocket 连接数 |
| HTTP 总请求数 (累计) | `http_requests_total` | 所有请求的累计数 |

---

## 推荐 PromQL 查询

### HTTP 请求速率 (req/s) by path

```promql
sum by (path) (rate(http_requests_total[5m]))
```

### HTTP 5xx 错误速率

```promql
sum by (path) (rate(http_requests_total{status=~"5.."}[5m]))
```

### HTTP 请求延迟 p50 by path

```promql
histogram_quantile(0.50, sum by (path, le) (rate(http_request_duration_seconds_bucket[5m])))
```

### HTTP 请求延迟 p95 by path

```promql
histogram_quantile(0.95, sum by (path, le) (rate(http_request_duration_seconds_bucket[5m])))
```

### HTTP 请求延迟 p99 by path

```promql
histogram_quantile(0.99, sum by (path, le) (rate(http_request_duration_seconds_bucket[5m])))
```

### WriteIntent accept 比率 (%)

```promql
100 * sum(write_intent_total{result="accept"}) / sum(write_intent_total)
```

### WriteIntent 速率分解 (accept vs reject)

```promql
sum by (result) (rate(write_intent_total[5m]))
```

### Audit Log 写入速率

```promql
rate(audit_log_writes_total[5m])
```

### Active WebSocket 连接数

```promql
biocore_ws_connections
```

### 总请求 5xx 错误率 (%)

```promql
100 * sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))
```

---

## 文件结构

```
grafana/                           # SP-FX-38 新增
  dashboards/
    biocore-overview.json          # BIOCore Overview dashboard
  provisioning/
    dashboards/
      biocore.yml                  # 自动加载 dashboards/
    datasources/
      prometheus.yml               # Prometheus 数据源配置

prometheus/                        # SP-FX-38 新增
  prometheus.yml                   # scrape 配置 (bearer token 鉴权)

observability/                     # T44 历史文件（含 cadvisor/mqtt 等）
  prometheus.yml
  grafana/dashboards/biocore-runtime.json

docker-compose.observability.yml   # 完整 observability profile
```

---

## 常见问题

### Q: Prometheus 显示 biocore target 为 DOWN

1. 确认 `METRICS_AUTH_TOKEN` 设置正确
2. 确认 BIOCore server 已启动且端口 3001 可访问
3. 确认 API key 具有 `admin` 角色

### Q: Grafana 找不到 BIOCore 文件夹

确认 grafana 容器中 provisioning 挂载正确:

```bash
docker exec biocore-grafana ls /etc/grafana/provisioning/dashboards/
docker exec biocore-grafana ls /var/lib/grafana/dashboards/
```

### Q: WriteIntent accept 率 panel 显示 "No data"

正常现象。WriteIntent 仅在操作员操作 AI 建议时产生。若无操作记录，panel 显示 "No data"。
