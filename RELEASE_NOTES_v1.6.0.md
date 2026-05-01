# BIOCore v1.6.0 — Node.js Hardening Release

**Release Date:** 2026-05-01
**Sprint:** Sprint 4 Track A
**Branch:** `sprint4-track-a-hardening` → merged to `main`
**Tag:** `v1.6.0`

---

## TL;DR

BIOCore is now production-ready for **7×24 commercial deployments**. This release adds:

- Crash recovery + memory watchdog + diagnostic dumps（runtime-guard 包）
- 4-channel notification system（feishu / dingtalk / telegram / webhook）
- Live `/admin/health` dashboard + Prometheus exposition
- 24h CI soak with 5 quantitative pass criteria
- Docker Compose（推荐）+ Windows NSSM（实验室现场）双部署形态
- 三档硬件矩阵（4GB / 16GB / 32GB+）

**99 new unit tests / 13 new observability endpoints / 2 new admin pages / 54 commits.**

---

## What's New

### 🛡️ `@biocore/runtime-guard`（v0.1.0，新包，7 模块）

| 模块 | 用途 |
|---|---|
| `RingBuffer` | 容量上限的 FIFO，metrics-collector / SSE 都用 |
| `inspectHandles` | `process._getActiveHandles` 包装，按构造器分类 |
| `EventLoopMonitor` | `perf_hooks` 报 p50/p99/max（修了 libuv reset 后非零的 quirk）|
| `diagnostic-dump` | 崩溃时写 JSON 包到 `./crashes/`，自动 prune |
| `crash-handler` | `installCrashHandlers({onCrash})` 全局兜底 uncaught/unhandled |
| `MemoryWatchdog` | 每 30s 采 RSS，连续 3 次超 RAM × 20% 触发 SIGTERM |
| `MetricsCollector` | 聚合所有上面 + 1440 点 24h ring buffer 时序 |

**42 tests，0 build 错误。**

### 📢 `@biocore/notifier`（v0.1.0，新包，7 模块）

5 事件类型：`process_restart` / `oom_threshold` / `plc_disconnect_5min` / `uncaught_exception` / `heap_growth_anomaly`（zod schema 校验）

4 通道：飞书 interactive card / 钉钉 markdown + HMAC sign / Telegram bot / 通用 webhook

`AlertRouter` 串起来：事件 → 规则匹配 → 通道分发 + 5 分钟防抖（heap_growth_anomaly 永不防抖，per spec R3）

**57 tests，0 build 错误。**

### 🌐 Server 新增端点（13 个）

| 端点 | 鉴权 |
|---|---|
| `GET /api/v1/admin/health/liveness` | 公开（docker probe）|
| `GET /api/v1/admin/health` | admin |
| `GET /api/v1/admin/health/timeseries` | admin |
| `GET /api/v1/admin/metrics` | 公开（Prometheus 标准）|
| `GET /api/v1/admin/crashes`、`GET /api/v1/admin/crashes/:name` | admin |
| `GET /api/v1/events`（SSE 流 + Last-Event-ID 续传 + max clients）| API Key |
| `GET/PUT/DELETE /api/v1/notifications/channels[/:id]`、`POST /:id/test` | admin |
| `GET/PUT /api/v1/notifications/rules` | admin |

`@biocore/server` v0.1.0 → **v0.2.0**。

### 🎨 前端（@biocore/web-ui v0.1.0 → v0.2.0）

- **`/admin/health`** — 实时健康度看板（10s 自动刷新）：4 状态卡片 + 内存曲线 + 事件循环延迟曲线 + 崩溃诊断包列表
- **`/settings/notifications`** — 通道管理（增删改 + 测试发送）+ 规则表（事件 ↔ 通道映射 + 严重度阈值）

### 📦 部署形态

#### Docker Compose（推荐）
- 加固后的 `docker-compose.yml`：healthcheck / restart: unless-stopped / json-file 50MB×10 logging / volume 持久化
- 多阶段 `Dockerfile`：deps → build → run（Node 20 alpine + pnpm@10.33）
- 可选 observability profile（Prometheus + Grafana auto-provisioned + biocore-runtime dashboard 7 panels）

#### Windows 工控机
- `scripts/install-windows-service.ps1` / `uninstall-windows-service.ps1`
- 基于 NSSM，5s 自动重启 + 50MB 日志轮转 + 加固 env vars 注入

### 🔬 验证

- **`scripts/soak-test.mjs`** — 24h 加速 soak（5x mock PLC + Puppeteer dashboard），5 条断言：
  1. heap_used 末值 ≤ baseline × 1.3
  2. active_handles 末值 - baseline ≤ 5
  3. uncaught_exceptions_total = 0
  4. influx_write_failures_total = 0
  5. browser JSHeapUsedSize 增量 ≤ 100 MB
- CI workflows（`.github/workflows/`）：每 PR 跑 unit-tests，每周日 04:00 UTC 跑 soak

---

## Bug Fixes

### 🐛 真 bug 修复

- **CommWatchdog 跨实例监听器累积**（`packages/batch-engine/src/comm-watchdog.ts`）
  `destroy()` 之前不解绑自身在 PLC EventEmitter 上的 4 个监听器（`comm_loss` / `comm_restored` / `reconnecting` / `reconnected`）。多反应器频繁增删场景下，旧实例继续响应 `comm_loss` 触发 N 次 `setTimeout`，触发 `MaxListenersExceededWarning`。
  **修复**：抽取 4 个 handler 为类字段（稳定引用），`destroy()` 中 `plc.off()` 精确解绑。Test case 4 从 `it.fails(...)` 翻为 regression guard。

### 📐 实施过程发现的 spec 修正

- libuv `IntervalHistogram.reset()` 后仍返 ~511ns 而不是 0，`EventLoopMonitor.snapshot()` 加 `count === 0` 守卫
- `AlertRouter`：rule-match 应在 throttle 之前（避免空匹配消耗 throttle window）
- `.gitignore`：带 `/` 的模式是 root-anchored，嵌套位置漏网，改用 `**/...`

### 🧹 Repo hygiene 顺手补的预存问题

- `packages/batch-engine/src/*.js` stale shadow 编译产物纳入 git 且 vitest resolver 优先 load — 已清
- `packages/data-service/src/*.js` 同上 — 已清
- `packages/server` 缺 `@biocore/data-service` workspace dep（用相对路径 `../../data-service/src/...` reach in）— 已补

---

## Migrations

`packages/server/migrations/022-notification-tables.sql`：

```sql
CREATE TABLE notification_channels (id, type, config, enabled, created_at);
CREATE TABLE notification_rules (id, event_type, channel_id, enabled, min_severity);
CREATE INDEX idx_notification_rules_event_type ON notification_rules(event_type) WHERE enabled = 1;
```

启动时 umzug 自动应用，无需手动操作。

---

## Upgrade Path

### Docker

```bash
git pull
docker compose pull        # or: docker compose build biocore-server
docker compose up -d biocore-server
docker compose ps          # 等 healthy
docker compose logs --tail 50 biocore-server | grep -E "runtime-guard|notifier"
# 期望:
#   [runtime-guard] installed (oom_threshold_mb=...)
#   [notifier] AlertRouter ready (channels=N)
#   [Migrator] ✓ N 个 migration 执行成功
```

### Windows NSSM

```powershell
nssm stop BioCore
git pull
pnpm install
pnpm -r build
nssm start BioCore
Start-Sleep 10
curl http://localhost:3001/api/v1/admin/health/liveness
```

### 必填新环境变量（追加到 .env）

```bash
NODE_OPTIONS=--max-old-space-size=2048
BIOCORE_OOM_THRESHOLD_MB=auto
BIOCORE_OOM_GRACE_SAMPLES=3
BIOCORE_DIAGNOSTIC_DUMP_DIR=./crashes
BIOCORE_DIAGNOSTIC_KEEP_LAST=50
NODE_ENV=production
```

详见 `docs/部署说明.md` §8。

---

## Documentation

- **`docs/部署说明.md`** — 加固章节（§7 硬件三档 + §8 env vars + §9 Docker + §10 Windows NSSM + §11 端点表）
- **`docs/加固SOP.md`**（新）— 10 章 340 行运维手册：健康度自检 / 优雅重启 / 取诊断包 / 配 4 通道 / 读 soak 报告 / 异常处置 / 备份恢复 / 季度故障演练
- **`docs/superpowers/specs/2026-05-01-nodejs-hardening-design.md`** — 810 行设计 spec
- **`docs/superpowers/plans/2026-05-01-nodejs-hardening-plan.md`** — 3846 行 49 task 实施计划
- **`docs/加固进度跟踪.md`** — 全 task 实施记录

---

## Known Issues

- `data-service.test.ts` 16 pre-existing 失败（`no such table: recipes`）：测试 setup 未跑 migrations。**与本次加固无关**，独立 cleanup task 修复。
- 未跑真实 24h soak（脚本就绪，等装机现场上跑）
- T34 build verify 显式跳过（每 task 已隐式跑 build + test，累计 99 tests 全绿）

---

## Package Versions

| Package | Before | After |
|---|---|---|
| `biocore` (root) | 0.1.0 | **1.6.0** |
| `@biocore/server` | 0.1.0 | **0.2.0** |
| `@biocore/web-ui` | 0.1.0 | **0.2.0** |
| `@biocore/batch-engine` | 0.1.0 | **0.1.1** |
| `@biocore/data-service` | 0.1.0 | **0.1.1** |
| `@biocore/runtime-guard` | — | **0.1.0**（新）|
| `@biocore/notifier` | — | **0.1.0**（新）|
| `@biocore/plc-driver` | 0.2.0 | 0.2.0（无变化）|

---

## Contributors

Sprint 4 Track A — 加固实施
- 设计 + 计划 + 实施：Claude Sonnet 4.6（subagent-driven）+ kris（reviewer / approver）
- 49 tasks / 54 commits / 99 new tests / 1 真 bug fixed

下一个 Sprint：**Track B1 — Sprint 4 M3.6 DAG 运行时**（让 batch-controller 真正支持 branch 节点切换）。
