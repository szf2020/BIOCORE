# BIOCore 加固运维 SOP

> Sprint 4 Track A 加固运维手册。读者：现场运维 / 实验室 IT / 远程支持。
> 配套：`docs/部署说明.md`（装机）、`docs/superpowers/specs/2026-05-01-nodejs-hardening-design.md`（设计）。

---

## 1. 健康度自检（每天必做）

打开浏览器访问：

```
http://<biocore-host>:3000/admin/health
```

页面 4 个区域，正常状态：

| 区域 | 正常 | 异常 |
|---|---|---|
| **健康总览**（4 卡片）| 内存 % < 60；PLC 在线；活跃批次符合预期；运行时长持续增长 | 任意卡片红色高亮 |
| **内存（24h）** | heap_used 平稳或缓慢起伏；rss 稳定 | 单调增长（线性向上）= 泄漏 |
| **事件循环延迟（24h）** | p50 < 5ms，p99 < 50ms | 持续 p99 > 200ms = 阻塞 |
| **重启与崩溃** | 重启次数 = 0 / 1（部署）；诊断包列表为空 | 重启 > 5 次/24h；诊断包堆积 |

如果 `/admin/health` 不可达，先检查 server 进程是否在跑（`docker compose ps` 或 `Get-Service BioCore`）。

---

## 2. 命令行健康度（无 GUI 时）

### Liveness 探针（不需 token）

```bash
curl -s http://<host>:3001/api/v1/admin/health/liveness
# 期望: {"code":0,"msg":"ok","data":{"status":"ok"},...}
```

### Prometheus 指标（不需 token）

```bash
curl -s http://<host>:3001/api/v1/admin/metrics | head -20
# 期望若干 biocore_* 指标
```

关注：
- `biocore_heap_used_bytes` 是否在合理范围（200-400MB ≈ 2-4亿）
- `biocore_event_loop_lag_seconds{quantile="0.99"}` 是否 < 0.05
- `biocore_handles_active` 是否稳定（不应单调增长）
- `biocore_plc_connected` 应为 1

---

## 3. 触发优雅重启

正常运维场景（升级、参数调整、清理内存）：

### Docker

```bash
docker compose restart biocore-server
```

### Windows NSSM

```powershell
nssm restart BioCore
```

期间 PLC 自带连锁继续运行（最多 3s 看门狗自动 Hold），Node 进程秒级重启后从 SQLite 恢复批次状态。前端短暂提示"连接断开 / 已重连"，丢失约 5s 的实时数据点（不影响发酵）。

**严禁在批次关键 phase（如灭菌温度爬坡）期间手动重启**。等批次进入 hold 或 idle 后再操作。

---

## 4. 取诊断包

### Web UI 方式（推荐）

进入 `/admin/health` → "诊断包列表" → 点击文件名 → 浏览器下载 JSON。

### API 方式

```bash
# 列出
curl -s -H "Authorization: Bearer <admin-jwt>" \
  http://<host>:3001/api/v1/admin/crashes

# 取单个
curl -s -H "Authorization: Bearer <admin-jwt>" \
  http://<host>:3001/api/v1/admin/crashes/2026-05-01T12-00-00-000Z-1234.json
```

### 文件系统方式

```bash
# Docker 部署
ls -la ./crashes/
cat ./crashes/2026-05-01T*.json | jq '.'

# Windows
dir C:\biocore\crashes\
```

诊断包包含：
- `error.message` / `error.stack` — 异常原因
- `process.uptime` / `pid` — 进程信息
- `memory.{rss,heapUsed,heapTotal}` — 崩溃时内存快照
- `handles.{active,byType}` — 活跃句柄类型分布
- `extra` — 应用特定上下文（OOM 触发时含 rss_mb / threshold_mb / samples）

---

## 5. 配置告警通道

进入 `/settings/notifications`。

### 5.1 飞书 Bot

1. 群 → 设置 → 群机器人 → 添加机器人 → Custom Bot
2. 复制 webhook URL（形如 `https://open.feishu.cn/open-apis/bot/v2/hook/<UUID>`）
3. UI："新增通道" → 类型 `feishu` → ID 填 `main_feishu`（自定义）→ webhook_url 粘贴 → 启用 → 保存
4. 点"发送测试" → 飞书群应收到一条 interactive card "[BIOCore] process_restart"

### 5.2 钉钉 Bot

1. 群 → 智能群助手 → 添加 → 自定义 → **必须勾选"加签"**
2. 复制 webhook URL（含 `access_token=...`）+ 复制 secret（`SECxxxxxx`）
3. UI：类型 `dingtalk` → webhook_url 粘贴 → sign secret 填 `SEC...` → 保存
4. 点"发送测试" → 钉钉群应收到 markdown 消息

### 5.3 Telegram Bot

1. Telegram 找 `@BotFather` → `/newbot` → 命名 → 拿 token（形如 `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`）
2. webhook_url 拼接：`https://api.telegram.org/bot<TOKEN>/sendMessage`
3. 把 bot 拉进群 → 在群里发任意一条消息 → 浏览器访问 `https://api.telegram.org/bot<TOKEN>/getUpdates` 查 `chat.id`（群 chat_id 通常负数，如 `-100123456789`）
4. UI：类型 `telegram` → webhook_url 填上面拼接好的 → chat_id 填 `-100...` → 保存
5. 点"发送测试"

### 5.4 通用 webhook

任何接受 JSON POST 的 HTTPS endpoint。Body 形如：

```json
{
  "title": "[BIOCore] plc_disconnect_5min",
  "body": "{...payload JSON...}",
  "severity": "warn|critical|info",
  "raw": { "reactor_id": "R1", "duration_min": 5.5, ... }
}
```

### 5.5 配规则

通道配好后，进入"触发规则"区：

- 选择事件类型（5 种：process_restart / oom_threshold / plc_disconnect_5min / uncaught_exception / heap_growth_anomaly）
- 选择通道（你刚配的）
- 严重度阈值（info/warn/critical）
- 启用复选框
- 保存改动

规则改动**立即生效**，不需重启。

### 5.6 防抖说明

同一 `event_type:reactor_id` 对在 5 分钟内只发一次（防 PLC 抖动刷屏）。**例外**：`heap_growth_anomaly` 永不防抖（heap 泄漏稀有但严重，每次都通报）。

---

## 6. 读 soak 测试报告

24h soak 由 CI 周日凌晨自动跑（`.github/workflows/soak.yml`）。也可以手动：

```bash
ADMIN_TOKEN=<jwt> pnpm soak             # 24h
ADMIN_TOKEN=<jwt> pnpm soak:short       # 1h（debug 用）
SOAK_BROWSER=false pnpm soak:tiny       # 3min（CI 通烟）
```

报告位置：`soak-runs/<ISO>-report.json`

```json
{
  "run": "2026-05-01T...",
  "duration_hours": 24,
  "speed_multiplier": 5,
  "browser_enabled": true,
  "baseline": { "heap_used_mb": 230, "rss_mb": 280, "handles_active": 18, "browser_heap_mb": 65 },
  "last":     { "heap_used_mb": 245, "rss_mb": 295, "handles_active": 19, "browser_heap_mb": 110 },
  "asserts": {
    "heapRatio": 1.06,         "heapRatioPass": true,
    "handleDelta": 1,          "handleDeltaPass": true,
    "uncaughtTotal": 0,        "uncaughtPass": true,
    "influxFailures": 0,       "influxFailuresPass": true,
    "browserDeltaMb": 45,      "browserDeltaPass": true
  },
  "pass": true
}
```

5 条断言（**ALL** 必须 true 才 pass）：

| 断言 | 通过条件 | 失败诊断 |
|---|---|---|
| `heapRatio` | ≤ 1.3 | server 端泄漏（看 CSV 找突变时间点）|
| `handleDelta` | ≤ 5 | 句柄/timer 没清理（grep `setInterval` / `setTimeout` 漏写 clear）|
| `uncaughtTotal` | == 0 | 未捕获异常（看 crashes/ 里的诊断包）|
| `influxFailures` | == 0 | InfluxDB 写入失败（检查网络 / token）|
| `browserDeltaMb` | ≤ 100 | 前端泄漏（Plotly buffer / WS 累积 / store 越界）|

CSV 文件 `<ISO>.csv` 每分钟一行，可导入 Excel 或 `pandas` 画曲线找泄漏起点。

---

## 7. 异常处置流程

### 收到 oom_threshold 告警

1. 立即看 `/admin/health` 内存曲线 — 是否单调增长还是瞬时尖刺
2. 单调增长 → 真泄漏 → 取最近 heap_snapshot（如有）+ 诊断包 → 找 patch
3. 瞬时尖刺 → 检查最近请求量 / 批量任务 → 加大 `BIOCORE_OOM_THRESHOLD_MB` 或调高 `BIOCORE_OOM_GRACE_SAMPLES`

### 收到 plc_disconnect_5min 告警

1. 检查 PLC 网络（ping IP）
2. 检查 PLC 心跳寄存器（`/settings/plc-config`）
3. 不可达超 1h → 联系硬件工程师查 PLC 自身

### 收到 uncaught_exception 告警

1. 进入 `/admin/health` → 诊断包列表 → 取最新文件
2. 看 `error.stack` 定位代码位置
3. **进程会自动重启**（PM2/Docker/NSSM 都配了），但要查根因避免循环崩溃

### 服务循环重启（每 5min 起一次又退）

1. 停服：`docker compose stop biocore-server` 或 `nssm stop BioCore`
2. 看 last 5 个诊断包 → 判断是同一个错误重复 vs 不同错误
3. 同一个错误：要 patch 代码或回滚版本
4. 不同错误：可能资源耗尽（磁盘满、文件描述符）→ 检查 host 资源

---

## 8. 备份恢复

### 备份（Docker）

```bash
# SQLite (业务数据)
docker compose exec biocore-server sqlite3 /app/data/biocore.db ".backup /app/data/backup.db"
cp data/backup.db /backup/biocore-$(date +%F).db

# InfluxDB (时序)
docker compose exec influxdb influx backup /tmp/influx-backup
docker cp biocore-influxdb:/tmp/influx-backup /backup/
```

### 恢复

```bash
# SQLite
docker compose stop biocore-server
cp /backup/biocore-2026-05-01.db data/biocore.db
docker compose start biocore-server

# InfluxDB
docker compose exec influxdb influx restore /tmp/influx-backup
```

### 备份频率建议

| 资产 | 频率 | 保留 |
|---|---|---|
| `data/biocore.db` | 每日 | 90 天 |
| InfluxDB bucket | 每周 | 365 天 |
| `crashes/` 诊断包 | 自动 prune（保留 50 个）| 不需手动 |
| `soak-runs/` 报告 | 每次跑生成；CI artifact 30 天 | — |

---

## 9. 升级 BIOCore 服务

### Docker 部署

```bash
git pull
docker compose pull         # 如果用 registry
# 或
docker compose build biocore-server   # 本地 build

docker compose up -d biocore-server   # 滚动替换
docker compose ps                      # 等 healthy
docker compose logs --tail 50 biocore-server | grep -E "runtime-guard|notifier|error"
```

### Windows NSSM

```powershell
nssm stop BioCore
git pull
pnpm install
pnpm -r build
nssm start BioCore

# 验证
Start-Sleep -Seconds 10
curl http://localhost:3001/api/v1/admin/health/liveness
```

### 数据库 migration 自动跑

启动日志会显示：
```
[Migrator] 待执行 N 个 migration: 022-notification-tables
[Migrator] ✓ N 个 migration 执行成功
```
若失败，server 会立即退出码 1。这时**不要重试**——查 SQL 文件 + 数据库一致性。

---

## 10. 故障演练（建议每季度）

| 场景 | 模拟 | 期望 |
|---|---|---|
| Node OOM | `kill -9 $(pgrep node)` | Docker/NSSM 5s 内重启 + 批次状态从 SQLite 恢复 |
| PLC 断电 | 拔网线 30 min | 看门狗自动 Hold + 飞书告警 + PLC 自带连锁动作 |
| InfluxDB 不可达 | `docker compose stop influxdb` 1h | data-service 缓冲不爆（cap=120）+ 恢复后 flush |
| 磁盘满 | 填 `/var` 到 95% | server 不裸崩，写日志失败仅 warn |
| 网络抖动 | `tc qdisc add ... loss 50%` | WS 自动重连，前端"已重连"提示 |

每次演练后归档：
- 启动 → 故障 → 恢复 时间线
- 哪些告警发出了 / 没发
- 是否有遗留的脏数据

---

**文档版本：** v1.0（Sprint 4 Track A 完成）
**配套 spec：** `docs/superpowers/specs/2026-05-01-nodejs-hardening-design.md`
**反馈：** 现场运维有疑问请联系 BIOCore 团队

## 11. Branch 求值故障排查

### 现象 1：OD600 采集后 branch 永远走 false
- 检查 condition-evaluator 字段名是否匹配（区分大小写）
- 查 `audit_logs` 找 `branch_evaluated` 行，看 `details.pv_snapshot` 是否含 OD600
- 若 `pv_snapshot` 中 OD600 为空，说明运行时 PV 采样未关联到 BatchController.lastSampledPV — 检查 PLC driver 是否在 onSample 时回写

### 现象 2：current_node_id 卡死
- 确认 dagExecutor 是否被外部代码意外重置
- 查 `audit_logs` 看 `phase_started` 序列是否中断
- 重启服务通常会用 `batches.current_node_id` 自动续跑

### 现象 3：升级后老批次启动失败
- 升级前应停掉所有 running 批次（决策 #2）
- 若误升，已存在的 idle 批次 `current_node_id IS NULL` → resumeBatch 自动从第一节点开始（R1 fallback），audit_logs 会写一行 `batch_resumed_from_null` 警告

### 现象 4：分支节点配置错误
- DAG 含环 → DAGExecutor.advance 抛 `MaxStepsExceeded`，启动批次时 BV 校验拒绝
- DAG 含 unreachable phase → 启动时 BV-16 拒绝
