# BIOCore Node.js 长期运行加固 — 设计 Spec

> **Track A — Node.js Hardening**
> **创建日期：** 2026-05-01
> **作者：** Claude (brainstorm with kris)
> **目标版本：** v1.6.0
> **预估工时：** 8 天
> **状态：** Spec 待 user review → writing-plans

---

## 0. 背景与目标

BIOCore 是基于 Node.js 20 + TypeScript 的实验室发酵控制平台。Sprint 1-3 已完成功能闭环（97 REST 端点、ISA-88 状态机、配方 v2 + DAG 编辑器、审批工作流），即将进入商用化阶段。商用化最大的稳定性风险是**单一 Node.js 后端进程在 7-30 天连续发酵批次中能否稳定运行**。

**本 spec 不解决：** 功能层面的需求（B1 DAG 运行时、C 模块等）。

**本 spec 解决的问题：**
1. 现有代码中可能存在的内存泄漏（5 个高风险点）
2. 进程崩溃后是否能被自动拉起、是否留下诊断证据
3. 商用化客户能否"看见"系统健康度
4. 异常事件能否主动通知到运维人员
5. "我们怎么知道这个东西能跑 7×24" — 长跑验证如何自动化

**成功标准：**
- 24h 加速 soak 在 CI 通过：heap ≤ 1.3× baseline、active handles ±5、零未捕获异常、零 InfluxDB 写丢失
- 故意杀进程（kill -9 / OOM 阈值）后 5s 内自动重启，批次状态从 SQLite 恢复
- 异常发生时通过飞书/钉钉/Telegram 主动告警，5 分钟内同事件防抖
- 客户在 `/admin/health` 一眼看完系统健康度，无需懂 Prometheus

---

## 1. 已确认的关键决策

| # | 决策项 | 选择 | 理由 |
|---|---|---|---|
| 1 | 部署形态 | Docker Compose 主 + Windows 工控机原生（NSSM）辅 | 实验室 90% 是 Windows，Docker on Windows 已稳定；同时 Linux 服务器也覆盖 |
| 2 | 重启容忍度 | 秒级断开可接受 | PLC 自带安全连锁兜底，3s 看门狗自动 Hold；Node 重启后从 SQLite 恢复 |
| 3 | 监控形态 | 内置 `/admin/health` 默认 + Prometheus profile 可选 | 实验室零运维知识也能用；高级用户可挂企业 Prom |
| 4 | 硬件规格 | 三档（4/16/32GB），内核稳态 200-400MB，OOM 阈值 = RAM × 20% | 一份代码三档自适应，4GB→800MB / 16GB→3.2GB / 32GB→6.4GB |
| 5 | 长跑测试 | 24h 加速 soak（5x Mock PLC，CI 自动化） | 速度+可重复+纳入 CI；7 天真机 soak 留独立运维 spec |
| 6 | 告警通道 | 内置 4 webhook（飞书/钉钉/TG/通用）+ 5 事件类型 + 5min 防抖 + 外部 `/api/v1/events` SSE 流 | 单实验室开箱可用 + 企业用户可拉走事件流；该基础设施 B1/C 模块复用 |

---

## 2. 实施路径：风险优先（Path 3）

最先做"最不确定的事"——内存泄漏审计可能修出意外问题，先做。

```
Phase 1 (2.5 天) ─→ Phase 2 (1 天) ─→ Phase 3 (4 天) ─→ 文档 (0.5 天)
泄漏审计与修复       进程守护+handler    可观测+通知+soak    部署/SOP
```

每 Phase 内部子任务可拆。Phase 间有强依赖（Phase 2 的 hook 点是 Phase 3 通知系统的事件源）。

---

## 3. 最终架构形态

```
┌─────────────────────────────────────────────────────────────────┐
│  Docker Host (Linux) 或 Windows 工控机                          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  biocore-server 容器 / NSSM 服务                          │  │
│  │                                                           │  │
│  │  Node.js 进程（保持现有 9 包架构，不改）                   │  │
│  │  ├── 已有：plc-driver / batch-engine / data-service ...   │  │
│  │  └── 新增：                                                │  │
│  │      ├── @biocore/runtime-guard (新包)                    │  │
│  │      │   ├── crash-handler.ts        全局 unhandled 捕获  │  │
│  │      │   ├── metrics-collector.ts    heap/rss/handles     │  │
│  │      │   ├── memory-watchdog.ts      OOM 阈值守护         │  │
│  │      │   └── diagnostic-dump.ts      崩溃时写诊断包        │  │
│  │      └── @biocore/notifier (新包)                          │  │
│  │          ├── alert-router.ts          事件 → 通道路由      │  │
│  │          ├── channels/{feishu,dingtalk,telegram,webhook}   │  │
│  │          └── throttler.ts             5 分钟同事件去重     │  │
│  │                                                           │  │
│  │  暴露：  /api/v1/admin/health/liveness   docker probe    │  │
│  │         /api/v1/admin/health             JSON 快照       │  │
│  │         /api/v1/admin/metrics            Prometheus       │  │
│  │         /api/v1/admin/crashes            诊断包列表/下载  │  │
│  │         /api/v1/events                   SSE 流          │  │
│  │         /admin/health                    前端页面        │  │
│  │         /settings/notifications          前端页面        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  influxdb 容器（已有）                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌── 可选 profile: --profile observability ─────────────────┐  │
│  │  prometheus 容器  +  grafana 容器                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Docker daemon / Windows SCM：                                  │
│   - 进程崩溃 → 自动重启（< 5s）                                 │
│   - log driver: json-file, max-size=50m, max-file=10           │
└─────────────────────────────────────────────────────────────────┘

外部依赖：
  - 客户的飞书/钉钉/Telegram bot webhook URL（在 /settings/notifications 配）
```

**架构关键点：**
- 加固以**两个新包** + 后端 5 个端点 + 前端 2 个页面落地，不重写现有 9 个包
- `runtime-guard` 在 server 启动时第一行 `require()` 接入，所有进程都被它兜
- `notifier` 是独立包，Track A 用，B1/C 模块可复用
- 现有 `MOCK_PLC=true` 通道做 24h 加速 soak 不需要改

---

## 4. Phase 1 — 5 风险点泄漏审计与修复（2.5 天）

工作模式：**审计 → 修复 → 单测 → 1h heap diff 验证**。

### 4.1 风险点 #1：plc-driver Snap7 重连定时器与心跳

**疑点：** 断线重连后旧 setInterval 心跳是否清理？socket FD 是否释放？

**审计动作：**
- 读 `packages/plc-driver/src/index.ts` `Snap7Adapter.connect/disconnect` 和心跳逻辑
- 写一个失败重连脚本：连接 → kill mock → 等待 → 重连 ×100 次
- 用 `process._getActiveHandles()` 在每轮后看句柄数

**预期修复：** disconnect 时 `clearInterval(this.heartbeatTimer)` + `socket.destroy()` + 把 `heartbeatTimer = null`

**单测：** "重连 100 次后 active handles ≤ baseline + 2"

### 4.2 风险点 #2：data-service 1Hz 采集 + 60s 写 Influx 缓冲

**疑点：** Influx 写入失败时缓冲队列是否无限增长？collector 在 batch 切换时是否 cleanup 旧 timer？

**审计动作：**
- 读 `packages/data-service/src/collector.ts:78-150` `DataCollector` 类
- 模拟"InfluxDB 关掉 1 小时再恢复"看缓冲行为
- 用 heap snapshot 看 `samples[]` 数组长度增长曲线

**预期修复：**
- 缓冲队列上限 = 3600（1h 采样数），超过丢弃最早 + 触发 `buffer_overflow` 事件（接 notifier）
- `stopCollection()` 必须 `clearInterval` 全部 timer 并 await flush 队列

**单测：** "Influx 不可达 1h 后，collector heap 增量 ≤ 50MB；恢复后老数据全部 flush 或丢弃日志"

### 4.3 风险点 #3：server WebSocket 客户端订阅清理

**疑点：** 客户端断开（关浏览器 / 网络中断）后，server 侧 `EventEmitter` 订阅是否真清掉？多客户端 1000 次连接后 listener 数？

**审计动作：**
- 读 `packages/server/src/index.ts` WebSocket 升级处和 `ws.on('close', ...)` 路径
- Playwright 起 50 个并发 WS 连接 → 关闭 → 重复 20 次 → 看 `eventEmitter.listenerCount()`

**预期修复：** `ws.on('close')` 必须遍历 `subscribedChannels` 调 `eventBus.off()`，并 `ws.removeAllListeners()`

**单测：** "1000 次 connect/disconnect 后 listenerCount 增量 ≤ 5"

### 4.4 风险点 #4：batch-engine comm-watchdog 定时器在批次结束后

**疑点：** `BatchController.complete()` / `stop()` 时 watchdog timer 是否清理？多次 start/complete 循环后是否堆积？

**审计动作：**
- 读 `packages/batch-engine/src/comm-watchdog.ts` 和 `batch-controller.ts` 生命周期
- 脚本：start batch → simulate complete → 重复 100 次 → handles 监控

**预期修复：** `Watchdog.stop()` 必须显式 `clearInterval` + `clearTimeout`，并在 `BatchController.dispose()` 中调用

**单测：** "100 次 batch 生命周期后 active timers ≤ baseline + 1"

### 4.5 风险点 #5：web-ui 长时间停留页面（浏览器侧）

**疑点：** Plotly.js 累计图、react-flow 编辑器、WebSocket 自动重连缓冲——前端 24h 不刷新 tab 是否爆内存？

**审计动作：**
- Chrome DevTools Memory profile：开 dashboard 页 24h（CI 用 puppeteer 模拟）
- 看 `Performance.memory.usedJSHeapSize` 曲线

**预期修复：**
- Plotly 数据缓冲设上限 + ring buffer
- WebSocket store 加 max retry log + 不无限堆积消息
- react-flow 大 DAG 加虚拟化或限制节点数 < 200

**单测：** "Puppeteer 6h 模拟，浏览器 heap 增量 ≤ 100MB"

> **注：** 这个虽然是浏览器侧问题，但属于"长期运行加固"用户感知范畴，归到本 spec。

### 4.6 Phase 1 工时

| 项 | 工时 |
|---|---|
| 5 风险点审计 + 修复 | 2 天 |
| 单测（5 个，每个 ≤ 30 行） | 0.3 天 |
| 1h heap diff 验证脚本 | 0.2 天 |
| **合计** | **2.5 天** |

**通过标准：** 5 个单测全绿；5 个 1h heap diff 全部"增量 ≤ 50MB"；CI 加 1 个 job 跑这套审计。

---

## 5. Phase 2 — 进程守护 + 全局崩溃 handler（1 天）

### 5.1 全局 handler

新建 `packages/runtime-guard/src/crash-handler.ts`：

```ts
// 在 server 启动第一行 require()
import { installCrashHandlers } from '@biocore/runtime-guard';
installCrashHandlers({
  onCrash: async (err, type) => {
    await writeDiagnosticDump(err, type);  // 写 ./crashes/<ISO>.json
    await notifier.emit('uncaught_exception', { err, type });
    // 不调 process.exit() — 让 supervisor 决定
  }
});
```

监听 4 类事件：
- `uncaughtException` — 同步抛出未捕获
- `unhandledRejection` — Promise 未捕获
- `warning` — 仅记录（不重启）
- `SIGTERM` / `SIGINT` — 优雅关停（drain WS + flush Influx + close PLC + close SQLite WAL → 30s 超时强退）

### 5.2 诊断包

文件：`./crashes/<ISO-timestamp>-<pid>.json`

```json
{
  "ts": "2026-05-01T09:30:00Z",
  "type": "uncaughtException",
  "error": { "message": "...", "stack": "...", "code": "..." },
  "process": { "pid": 1234, "uptime": 86400, "version": "v20.x" },
  "memory": { "heapUsed": 412, "heapTotal": 600, "rss": 580, "external": 12 },
  "handles": { "active": 23, "byType": { "TCP": 5, "Timer": 8, ... } },
  "lastBatchId": "B-2026-05-01-001",
  "lastPLCStatus": "connected",
  "git": { "commit": "abc123", "branch": "main" }
}
```

保留策略：本地保留最近 50 个，超出删最早；可经 `/api/v1/admin/crashes` 列出+下载（仅 admin 权限）。

### 5.3 Memory watchdog

```ts
// 每 30s 采样 process.memoryUsage().rss
// 连续 3 次（默认）超 RAM × 20% 时：
//   1. 触发 'oom_threshold' 事件给 notifier
//   2. 写 heap snapshot 到 ./crashes/heap-<ISO>.heapsnapshot
//   3. 调 process.kill(process.pid, 'SIGTERM') — 让 supervisor 优雅重启
```

阈值在启动时按 `os.totalmem()` 计算，可被 env `BIOCORE_OOM_THRESHOLD_MB` 覆盖；连续次数可被 `BIOCORE_OOM_GRACE_SAMPLES=3` 覆盖。

### 5.4 进程守护配置

#### Docker（主形态）— 改 `docker-compose.yml`

```yaml
services:
  biocore-server:
    build: .
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "scripts/healthcheck.mjs"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "10"
    environment:
      - NODE_OPTIONS=--max-old-space-size=2048
      - BIOCORE_OOM_THRESHOLD_MB=auto
    volumes:
      - ./crashes:/app/crashes
      - ./data:/app/data
```

`scripts/healthcheck.mjs`：
- 调 `http://localhost:3001/api/v1/admin/health/liveness`
- 检查响应 200 + heap < 阈值的 1.2 倍
- 不健康时返回非零退出码 → docker 重启

#### Windows 工控机 — 新建 `scripts/install-windows-service.ps1`

```powershell
nssm install BioCore "C:\Program Files\nodejs\node.exe"
nssm set BioCore AppParameters "C:\biocore\packages\server\dist\index.js"
nssm set BioCore AppDirectory "C:\biocore"
nssm set BioCore AppExit Default Restart
nssm set BioCore AppRestartDelay 5000
nssm set BioCore AppStdout "C:\biocore\logs\stdout.log"
nssm set BioCore AppStderr "C:\biocore\logs\stderr.log"
nssm set BioCore AppRotateFiles 1
nssm set BioCore AppRotateBytes 52428800
nssm set BioCore AppRotateOnline 1
nssm set BioCore AppEnvironmentExtra "NODE_OPTIONS=--max-old-space-size=2048" "BIOCORE_OOM_THRESHOLD_MB=auto"
nssm start BioCore
```

附 `scripts/uninstall-windows-service.ps1` 配套。

### 5.5 优雅关停

按顺序，30s 总超时：

1. 停止接受新 HTTP 请求（`server.close()`）
2. 关闭所有 WebSocket（broadcast `{type: 'shutdown'}` → close）
3. flush data-service Influx 写队列
4. `BatchController.dispose()` — 不停批次（PLC 自己跑），只清 timer
5. `plc-driver.disconnect()` — 关 socket
6. SQLite `db.close()`（WAL checkpoint）
7. 30s 强退兜底

### 5.6 Phase 2 工时

| 项 | 工时 |
|---|---|
| `@biocore/runtime-guard` 包 + 4 模块 | 0.4 天 |
| docker-compose 改造 + healthcheck 脚本 | 0.2 天 |
| Windows NSSM 安装/卸载脚本 + 文档 | 0.2 天 |
| 优雅关停管线接入 server | 0.2 天 |
| **合计** | **1 天** |

**通过标准：**
- 手动 `kill -9` server → docker 5s 内重启 → 现有批次状态从 SQLite 恢复
- 故意 `throw new Error('test')` → 诊断包写出 → notifier 推送
- 故意 `setInterval(()=>{ buf.push(big) }, 10)` → 30s 内 OOM watchdog 触发优雅重启

---

## 6. Phase 3 — 可观测性 + 通知系统 + 24h Soak（4 天）

### 6.1 后端 metrics 端点

#### `GET /api/v1/admin/health/liveness`
- 用途：docker healthcheck / k8s liveness
- 响应：`200 {"status":"ok"}` 或非 200
- 仅检查事件循环未阻塞（lag < 1s）

#### `GET /api/v1/admin/health`

权限：admin。返回 JSON 体快照：

```json
{
  "service": { "version": "1.x", "uptime_sec": 86400, "node": "v20.x", "pid": 1234 },
  "memory": { "heap_used_mb": 312, "heap_total_mb": 480, "rss_mb": 410,
              "oom_threshold_mb": 1638, "oom_pct": 25 },
  "handles": { "active": 23, "by_type": {"TCP":5,"Timer":8,"Pipe":3,"FSReqCallback":7} },
  "event_loop": { "lag_p50_ms": 2, "lag_p99_ms": 18 },
  "plc": { "connected": true, "last_heartbeat_age_ms": 850, "reconnect_count_24h": 0 },
  "ws": { "connections": 3, "total_listeners": 14 },
  "data_service": { "buffer_depth": 12, "influx_writes_24h": 86400, "influx_failures_24h": 0 },
  "batches": { "active_count": 1, "current_batch_id": "B-2026-05-01-001" },
  "restarts": { "last_24h": 0, "since_install": 2, "last_reason": "manual_deploy" },
  "crashes": { "total": 0, "files": [] },
  "alerts": { "active": [], "throttled_24h": 0 }
}
```

#### `GET /api/v1/admin/metrics`
- Prometheus 文本格式（用 `prom-client`）
- metric 加 `biocore_` 前缀：
  - `biocore_heap_used_bytes` / `biocore_rss_bytes` / `biocore_event_loop_lag_seconds{quantile=0.5|0.99}`
  - `biocore_plc_connected` / `biocore_plc_reconnect_count_total`
  - `biocore_ws_connections` / `biocore_handles_active`
  - `biocore_restarts_total{reason}` / `biocore_uncaught_exceptions_total{type}`
  - `biocore_influx_write_failures_total` / `biocore_data_buffer_depth`
- 默认开放，无需 admin（标准 Prom scrape 习惯）；配 `BIOCORE_METRICS_REQUIRE_AUTH=true` 可锁

#### `GET /api/v1/events` (SSE 流)
- 用途：企业用户 IT 拉走事件流到自己 SOC
- 权限：API Key
- 协议：Server-Sent Events，每事件一行 JSON
- 事件类型同 notifier 的 5 类 + 心跳每 30s 一条
- 断线重连用 `Last-Event-ID` 续传（保留最近 1000 条事件在内存 ring buffer）

### 6.2 前端 `/admin/health` 页面

新建 `packages/web-ui/src/app/admin/health/page.tsx`，4 个区域：

1. **健康总览卡片**：service uptime、当前内存%、PLC 状态、活跃批次
2. **内存曲线**：最近 24h heap_used / rss 折线图（数据从内置 metrics-collector ring buffer 读，独立于 InfluxDB）
3. **事件循环 + 句柄**：lag p50/p99 + 句柄数曲线 + 按类型分布
4. **重启与崩溃记录**：最近 50 次重启原因 + 崩溃诊断包列表（点击下载 JSON）

存储：metrics-collector 在内存 ring buffer 保留最近 24h（每分钟一个采样点 = 1440 点 × ~200B = 288KB，零磁盘 IO）；超 24h 滚动覆盖。

### 6.3 通知系统（新建 `@biocore/notifier`）

#### 包结构

```
packages/notifier/src/
├── alert-router.ts          // 事件 → 规则匹配 → 通道分发
├── throttler.ts             // 5 分钟去重（key = event_type + reactor_id）
├── channels/
│   ├── feishu.ts            // 飞书 bot webhook
│   ├── dingtalk.ts          // 钉钉 bot webhook（含 sign 校验）
│   ├── telegram.ts          // bot api sendMessage
│   └── webhook.ts           // 通用 POST JSON
├── event-types.ts           // 5 个事件类型 + zod schema
└── index.ts                 // emit() 公开 API
```

#### SQLite 表（migration 009）

```sql
CREATE TABLE notification_rules (
  id          INTEGER PRIMARY KEY,
  event_type  TEXT NOT NULL,
  channel_id  TEXT NOT NULL,
  enabled     INTEGER DEFAULT 1,
  min_severity TEXT DEFAULT 'warn'
);

CREATE TABLE notification_channels (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  config      TEXT NOT NULL,
  enabled     INTEGER DEFAULT 1,
  created_at  TEXT NOT NULL
);
```

#### 防抖（throttler）
- key = `<event_type>:<reactor_id || 'global'>`
- 5 分钟内同 key 只发首次；窗口内后续累加 count 入第 6 分钟下一条
- 内存 Map，每分钟扫一次过期项（不持久化，重启清零）

#### 公开 API

```ts
import { notifier } from '@biocore/notifier';

await notifier.emit('plc_disconnect_5min', {
  reactor_id: 'R1',
  duration_min: 6.2,
  last_seen: '2026-05-01T09:24:00Z'
});
```

#### 接入点（Phase 1/2 的 hook 点）

- `runtime-guard/crash-handler` → `uncaught_exception`
- `runtime-guard/memory-watchdog` → `oom_threshold` + `heap_growth_anomaly`
- `runtime-guard/supervisor-bridge` → `process_restart`
- `plc-driver` watchdog → `plc_disconnect_5min`

### 6.4 前端 `/settings/notifications` 页面

新建 `packages/web-ui/src/app/settings/notifications/page.tsx`：

- **通道管理**：增删改 4 类通道；每类一个测试按钮（"发送测试消息"）
- **规则表**：5 行一行一事件类型，多选要发到哪些通道，每行一个 severity 阈值
- **最近告警**（v2 可选）：最近 50 条已发告警的状态（成功/失败/throttled）

### 6.5 24h 加速 Soak 脚本

新建 `scripts/soak-test.mjs`：

```js
// 1. 启动 server with MOCK_PLC=true + SOAK_SPEED=5
// 2. mock-plc 推数据频率 5x（200ms/帧 → 等效 1Hz × 5）
// 3. 自动启动 3 个批次（顺序：start → 模拟 idle/running/holding/complete 全状态机）
// 4. 每分钟拉一次 /api/v1/admin/health，记录到 ./soak-runs/<ISO>.csv
// 5. 同时用 puppeteer 开 dashboard 页 + recipe edit-v2 页 24h 不关
// 6. 24h 后断言：
//    - heap_used_mb 末值 ≤ 启动值 × 1.3
//    - active_handles 末值 - 启动值 ≤ 5
//    - uncaught_exceptions_total = 0
//    - influx_write_failures_total = 0
//    - 浏览器 Performance.memory.usedJSHeapSize 增量 ≤ 100MB
// 7. 输出结构化报告 ./soak-runs/<ISO>-report.json
```

#### CI 集成

新建 `.github/workflows/soak.yml` 或 `scripts/ci/run-soak.sh`：
- **触发**：手动 + 每周日凌晨自动 + main 分支合并后
- **Runner**：需要 ≥ 8GB / 24h 时间窗（self-hosted runner 或单独 VM）
- **存储**：报告 + 内存曲线 CSV + heap snapshot 上传 artifact 保留 30 天

### 6.6 Phase 3 工时

| 项 | 工时 |
|---|---|
| `runtime-guard` metrics-collector + 3 端点 | 0.6 天 |
| 前端 `/admin/health` 页面（4 区域） | 0.7 天 |
| `@biocore/notifier` 包 + 4 通道 + throttler | 1 天 |
| migration 009 + `/settings/notifications` 前端 | 0.5 天 |
| `/api/v1/events` SSE 流 + ring buffer + Last-Event-ID | 0.3 天 |
| Prometheus profile（docker-compose + dashboard.json） | 0.4 天 |
| `scripts/soak-test.mjs` + CI 集成 + 通过标准断言 | 0.5 天 |
| **合计** | **4 天** |

**通过标准：**
- `/admin/health` 页面 24h soak 中数据持续刷新且无 NaN
- 故意拔 mock PLC 网线 5min → 飞书测试通道收到一条告警；6min 后再断 → 防抖（不重发）
- `/api/v1/events` SSE 用 `curl -N` 连 1h 收到 ≥ 2 条 heartbeat
- 24h soak 报告全部断言通过

---

## 7. 跨切面：目录结构、依赖、配置、文档

### 7.1 新增/修改文件清单

```
biocore/
├── packages/
│   ├── runtime-guard/                  ★ 新建
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                // public API
│   │   │   ├── crash-handler.ts
│   │   │   ├── metrics-collector.ts
│   │   │   ├── memory-watchdog.ts
│   │   │   ├── diagnostic-dump.ts
│   │   │   ├── ring-buffer.ts          // 24h metric buffer + event ring
│   │   │   ├── event-loop-monitor.ts   // perf_hooks lag 采样
│   │   │   └── handles-inspector.ts    // process._getActiveHandles 包装
│   │   └── tests/*.test.ts
│   │
│   ├── notifier/                       ★ 新建
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── alert-router.ts
│   │   │   ├── throttler.ts
│   │   │   ├── event-types.ts          // 5 个事件类型 + zod schema
│   │   │   └── channels/{feishu,dingtalk,telegram,webhook}.ts
│   │   └── tests/
│   │
│   ├── server/
│   │   ├── src/
│   │   │   ├── index.ts                // 第一行 require('@biocore/runtime-guard').install()
│   │   │   ├── routes/
│   │   │   │   ├── admin-health.ts     ★ 新建
│   │   │   │   ├── admin-metrics.ts    ★ 新建
│   │   │   │   ├── admin-crashes.ts    ★ 新建
│   │   │   │   ├── events-sse.ts       ★ 新建
│   │   │   │   └── notifications.ts    ★ 新建（CRUD channels/rules + 测试发送）
│   │   │   └── shutdown.ts             ★ 新建（graceful shutdown 管线）
│   │   └── migrations/
│   │       └── 009-notification-tables.sql  ★ 新建
│   │
│   └── web-ui/
│       └── src/app/
│           ├── admin/health/page.tsx           ★ 新建
│           └── settings/notifications/page.tsx ★ 新建
│
├── scripts/
│   ├── soak-test.mjs                   ★ 新建
│   ├── healthcheck.mjs                 ★ 新建（Docker healthcheck）
│   ├── install-windows-service.ps1    ★ 新建
│   ├── uninstall-windows-service.ps1  ★ 新建
│   └── ci/run-soak.sh                  ★ 新建
│
├── docker-compose.yml                  ✏ 改：加 healthcheck/restart/logging/volumes
├── docker-compose.observability.yml    ★ 新建（Prometheus + Grafana profile）
├── observability/                      ★ 新建
│   ├── prometheus.yml
│   └── grafana/dashboards/biocore-runtime.json
└── docs/
    ├── 部署说明.md                     ✏ 改：加三档硬件 + Docker/Windows 两种装机
    ├── 加固SOP.md                      ★ 新建（运维操作手册）
    └── superpowers/specs/
        └── 2026-05-01-nodejs-hardening-design.md  ★ 本 spec 文档
```

### 7.2 依赖增量

#### `packages/runtime-guard/package.json`
```json
{
  "dependencies": {
    "prom-client": "^15.1.0"
  }
}
```
（事件循环监控用 `perf_hooks`，句柄检查用内置 API，不引外部包）

#### `packages/notifier/package.json`
```json
{
  "dependencies": {
    "zod": "^3.x",
    "@biocore/data-service": "workspace:*"
  }
}
```
（HTTP 用 Node 内置 `fetch`，钉钉 sign 用内置 `crypto`，不引 axios）

#### `packages/server/package.json`
```json
{
  "dependencies": {
    "@biocore/runtime-guard": "workspace:*",
    "@biocore/notifier": "workspace:*"
  }
}
```

#### 根 `package.json`
```json
{
  "scripts": {
    "soak": "node scripts/soak-test.mjs",
    "soak:short": "SOAK_DURATION_HOURS=1 node scripts/soak-test.mjs",
    "healthcheck": "node scripts/healthcheck.mjs"
  },
  "devDependencies": {
    "puppeteer": "^21.x"
  }
}
```

### 7.3 环境变量增量（追加到 `.env.example`）

```bash
# 加固相关
BIOCORE_OOM_THRESHOLD_MB=auto              # auto = RAM × 20%；可写具体 MB 数
BIOCORE_OOM_GRACE_SAMPLES=3                # 连续 N 次超阈值才触发重启
BIOCORE_METRICS_REQUIRE_AUTH=false         # /metrics 是否要求 admin
BIOCORE_DIAGNOSTIC_DUMP_DIR=./crashes
BIOCORE_DIAGNOSTIC_KEEP_LAST=50
BIOCORE_EVENT_BUFFER_SIZE=1000             # SSE Last-Event-ID 重放 buffer
BIOCORE_NOTIFIER_THROTTLE_MIN=5
BIOCORE_SSE_MAX_CLIENTS=100
NODE_OPTIONS=--max-old-space-size=2048

# Soak 测试
SOAK_DURATION_HOURS=24
SOAK_SPEED_MULTIPLIER=5
SOAK_REPORT_DIR=./soak-runs
```

### 7.4 配置文件改动一览

| 文件 | 改动 |
|---|---|
| `pnpm-workspace.yaml` | 自动包含 `packages/*` 不需改 |
| `tsconfig.base.json` | 不需改 |
| `docker-compose.yml` | 加 healthcheck / restart / logging / volumes / NODE_OPTIONS / OOM env |
| `docker-compose.observability.yml`（新） | Prometheus + Grafana service，`--profile observability` |
| `.env.example` | 上面 11 个新 var |
| `migrations/009-notification-tables.sql`（新） | 2 表 + 1 index |

### 7.5 文档产出

| 文档 | 内容 | 工时 |
|---|---|---|
| `docs/部署说明.md`（改） | 增三档硬件矩阵；Docker 和 Windows 装机两路；`.env` 变量索引；OOM 阈值算法；备份策略 | 0.2 天 |
| `docs/加固SOP.md`（新） | 运维操作手册：怎么看 health 页面、崩溃了怎么取诊断包、告警通道配置示例（飞书/钉钉/Telegram 截图）、soak 测试解读 | 0.2 天 |
| `docs/superpowers/specs/2026-05-01-nodejs-hardening-design.md`（新） | 本 spec 全文 | 0.1 天 |

### 7.6 不在本 spec 范围（明确划界）

- ❌ 全量 `console.log` → `pino` 结构化日志迁移（独立 spec，约 50+ 文件）
- ❌ 邮件 SMTP 告警（独立 spec，要测 SMTP）
- ❌ 7 天真机 soak（独立运维 spec，需要现场实验室）
- ❌ 多机汇总监控 / 中央告警平台
- ❌ `/admin/health` 页面历史回溯超过 24h
- ❌ 日志全文搜索 / 集中式日志聚合（ELK / Loki）
- ❌ 告警 ack/工单流（PagerDuty 之类）
- ❌ web-ui 长跑修复中超出"加内存上限+ring buffer"的深度重构
- ❌ B1（DAG 运行时）和 C 模块的告警接入（它们 spec 里自己接 notifier 即可）

---

## 8. 测试策略

### 8.1 测试金字塔

```
                        ┌──────────────┐
                        │ 24h Soak (CI) │   1 套 / 周日触发 + 手动 + main 合并
                        └──────────────┘
                       ┌────────────────┐
                       │  集成测试 (CI)  │   ~10 个 / 每次 PR
                       └────────────────┘
                  ┌──────────────────────────┐
                  │  单测 (CI)               │   ~30 个 / 每次 commit
                  └──────────────────────────┘
                  ┌──────────────────────────┐
                  │  Heap-diff 验证脚本（手动） │   每个风险点 1 个，1h 跑完
                  └──────────────────────────┘
```

### 8.2 单测（约 30 个，秒级）

| 包 | 测试主题 | 数量 |
|---|---|---|
| `runtime-guard` | crash-handler 路由、ring-buffer 满溢覆盖、event-loop 采样、handles-inspector 分类、memory-watchdog 阈值、diagnostic-dump 字段完整性 | ~10 |
| `notifier` | throttler 5min 窗口、4 通道 payload 形状、alert-router 路由匹配、钉钉 sign 计算、SSE Last-Event-ID 重放 | ~8 |
| `plc-driver`（增量） | 重连 100 次后 active handles 不增长 | 1 |
| `data-service`（增量） | influx 缓冲队列上限 + 丢弃旧数据策略 | 1 |
| `server`（增量） | WS connect/disconnect 1000 次后 listenerCount ≤ baseline+5 | 1 |
| `batch-engine`（增量） | watchdog stop 后 active timers ≤ baseline+1 | 1 |
| **新端点验收** | `/admin/health` 字段断言、`/admin/metrics` Prom 格式、`/api/v1/events` SSE 协议、`/settings/notifications` CRUD | ~8 |

通过门槛：CI lint + typecheck 0 错误；单测 100% 绿；增量覆盖率 ≥ 80%。

### 8.3 集成测试（约 10 个，分钟级）

| 场景 | 断言 |
|---|---|
| 启动 + 正常关停（SIGTERM） | 30s 内退出码 0；WAL checkpointed；无 leaked handles |
| 启动 + 强杀（SIGKILL）+ 重启 | 自动重启 < 5s；批次状态从 SQLite 恢复 |
| 故意 throw uncaughtException | 诊断包写出；notifier 收到事件；进程不裸崩 |
| 故意填充 buffer 触发 OOM watchdog | heap snapshot 写出；优雅重启；之后 health 正常 |
| 配通道 + 模拟事件 | 飞书/钉钉/Telegram/通用 webhook 各收到 1 条 |
| 防抖测试 | 5min 内同事件 2 次 → 仅 1 条发出 + 1 条 throttled 计数 |
| Mock PLC 断连 5min | `plc_disconnect_5min` 事件触发 + 通知发送；6min 时不重发 |
| `/api/v1/events` SSE 1h 连接 | 至少 2 条 heartbeat；中断 30s 重连后 Last-Event-ID 正确续传 |
| `/admin/health` 24h 数据 | ring-buffer 1440 个采样点全有；超期滚动覆盖 |
| Prometheus profile 启用 | `docker compose --profile observability up` 后 prom 能 scrape；Grafana 看板加载 |

### 8.4 24h Soak（CI 周触发）

通过门槛 5 条同时成立才 pass：
1. heap_used_mb 末值 ≤ 启动值 × 1.3
2. active_handles 末值 - 启动值 ≤ 5
3. uncaught_exceptions_total = 0
4. influx_write_failures_total = 0
5. 浏览器 Performance.memory.usedJSHeapSize 增量 ≤ 100MB

### 8.5 手动验收（release 候选阶段）

打 tag 前必跑：
- 安装 Docker 装机包到一台干净 4GB 机器 → 启动 → 通过装机自检
- 安装 Windows NSSM 装机包到一台干净 Win10 → 启动 → `nssm restart` 后状态恢复
- 飞书/钉钉/Telegram 三个真通道各发一次测试消息
- 24h soak CI 报告 attached 到 release notes

---

## 9. 风险与对策

| ID | 风险 | 概率 | 后果 | 对策 |
|---|---|---|---|---|
| R1 | `runtime-guard` 第一行 require 失败 → server 起不来 | 低 | 致命 | runtime-guard 内部 try/catch 全部初始化逻辑；初始化失败时降级为"只装空 noop crash handler"，server 继续启动；写 `init_failed.json` |
| R2 | OOM watchdog 误判（瞬时大请求 vs 真泄漏） | 中 | 误重启 | 阈值需"连续 3 次 30s 采样都超阈值"才触发；可被 env `BIOCORE_OOM_GRACE_SAMPLES=3` 调整 |
| R3 | 防抖泄漏告警（实际泄漏被防抖压住） | 中 | 漏报 | `heap_growth_anomaly` 事件不防抖（罕见，每次都通报）；其他事件防抖窗口外 escalate severity |
| R4 | 钉钉/飞书 webhook 接口变更 | 低 | 告警断 | 通道层做最小封装，发送失败计数 → 超 10 次失败 → 在 health 页面红字提示"通道异常"；客户切换通道无需改代码 |
| R5 | SSE 长连接占 FD | 中 | FD 耗尽 | 连接上限 `BIOCORE_SSE_MAX_CLIENTS=100`；超限返回 503；ring buffer 1000 条上限避免内存涨 |
| R6 | Phase 1 修风险点引入回归 | 中 | 现有功能坏 | 每个风险点修复必须先有失败测试 → 修复 → 测试通过；提交前跑全 monorepo `pnpm test` |
| R7 | 24h soak 在 CI 资源不够 | 中 | CI 阻塞 | self-hosted runner / 单独 VM；如不可达，降级为本地手动 trigger，不阻塞 PR 合并 |
| R8 | Prometheus profile 与现有端口冲突 | 低 | 启动失败 | profile 默认 prom: 9090 / grafana: 3002（避开 3000/3001/8086） |
| R9 | Windows NSSM 服务用户权限不足读取 PLC 网卡 | 中 | PLC 不通 | 安装脚本默认装为 `LocalSystem`；文档说明若装为低权限用户需放行防火墙 |
| R10 | 与 B1（DAG 运行时）并行开发冲突 | 中 | 合并冲突 | runtime-guard / notifier 是新包不冲突；server `index.ts` 第一行 + shutdown.ts 是 conflict 热点，约定先合 Track A |

---

## 10. 回滚策略

| 改动类型 | 回滚方式 |
|---|---|
| 新建 `runtime-guard` / `notifier` 包 | 删除包 + 移除 server import + 移除 install() 调用 |
| migration 009 | 写 down 脚本 `DROP TABLE notification_rules; DROP TABLE notification_channels;` 但**注意**：已有数据丢失。生产环境改用"标记 enabled=0"软关闭 |
| docker-compose 改动 | 单独保留 `docker-compose.legacy.yml` 作为回滚 baseline |
| Phase 1 各风险点修复 | 每个修复独立 commit；发现回归 `git revert <sha>` 单独回滚 |
| Windows NSSM 服务 | `scripts/uninstall-windows-service.ps1` 一键卸载 + 还原 .env |

回滚发布顺序（与上线相反）：
1. 先在 web-ui 隐藏 `/admin/health` 和 `/settings/notifications` 入口（feature flag）
2. 后端保留端点 1 个版本周期，给客户切换出口
3. 下个版本完整删除

---

## 11. 版本与 release

- 本 spec 落地后版本号：**v1.6.0**（minor，因为有面向用户的新页面 + 新基础设施）
- migration 009 = recipes/audit 之外新建表，不破坏现有 schema
- release notes 必须含三档硬件矩阵 + 升级 SOP（停服 → 拉新镜像 → docker compose up -d → 等 healthy）

---

## 12. 工时汇总

| Phase | 工时 |
|---|---|
| Phase 1：泄漏审计 + 修复 | 2.5 天 |
| Phase 2：进程守护 + handler | 1 天 |
| Phase 3：可观测 + 通知 + soak | 4 天 |
| 文档（部署说明、硬件三档、SOP） | 0.5 天 |
| **合计** | **8 天** |

---

## 13. 后续 Spec 队列

完成本 spec 后下一个 brainstorm 的项目：

- **B1：Sprint 4 — M3.6 DAG 运行时**（让 batch-controller 真正支持 branch 节点）
- **B0：Sprint 3 浏览器 E2E 10 项验证**（不需 spec，可与 Track A 并行执行）
- **C1-C5：🟡 进行中模块逐个**（软测量 UI / AI 摘要 / SPC / KPI / AI 报告导出）

---

**Spec 状态：** 待 user review
**下一步：** 用户确认后进入 writing-plans skill，产出 implementation plan
