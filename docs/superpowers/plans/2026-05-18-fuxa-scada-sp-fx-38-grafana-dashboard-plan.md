# SP-FX-38 实施计划: Grafana Dashboard — BIOCore Overview

**日期**: 2026-05-18
**Sprint**: SP-FX-38
**状态**: IN PROGRESS

---

## 任务列表

### Task 1: 创建目录结构
- `mkdir -p grafana/dashboards grafana/provisioning/dashboards grafana/provisioning/datasources`
- `mkdir -p prometheus`
- verify: 目录存在

### Task 2: 写 grafana/dashboards/biocore-overview.json
- 11 panels 覆盖 4 SP-FX-28 metric + WS connections
- 变量: $__rate_interval (Grafana 内建), $instance
- verify: JSON.parse 不报错

### Task 3: 写 grafana/provisioning/dashboards/biocore.yml
- auto-load path: `/var/lib/grafana/dashboards`
- verify: 文件存在，YAML 格式正确

### Task 4: 写 grafana/provisioning/datasources/prometheus.yml
- datasource: Prometheus, url: http://prometheus:9090
- verify: 文件存在

### Task 5: 写 prometheus/prometheus.yml
- job_name: biocore
- metrics_path: /api/v1/metrics
- bearer_token via env 占位
- scrape_interval: 15s
- verify: 文件存在

### Task 6: 写 JSON schema 验证测试
- `packages/server/src/__tests__/grafana-dashboard.test.ts`
- Test 1: JSON 可解析，panels.length > 0
- Test 2: 每 panel 有 id/type/title/gridPos
- verify: vitest 通过

### Task 7: 写 docs/observability-setup.md
- 启动命令
- 一键 import dashboard 说明
- 推荐 PromQL 列表
- verify: 文件存在

### Task 8: git commit and push
- commit spec + plan
- commit all new config files
- commit docs
- git pull --rebase origin main then push
- verify: push 成功

---

## 成功标准

- `grafana/dashboards/biocore-overview.json` 存在且 JSON 合法
- `prometheus/prometheus.yml` 存在
- vitest 通过（含 grafana-dashboard.test.ts）
- push 到 origin/main 成功
