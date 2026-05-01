# BIOCore v1.7.1 — Stability Patches

**Release Date:** 2026-05-02
**Type:** Patch release on top of v1.7.0
**Tag:** `v1.7.1`

## TL;DR
v1.7.0 后专项 Node.js 稳定性审计发现的修复。1 个高危 + 2 个低危。

## Fixes

### HIGH — `broadcast()` 加 try/catch（防 WS 客户端单点拖崩服务）
`packages/server/src/index.ts:broadcast()` 之前直接 `client.send(msg)`，当 WS 连接半关闭/缓冲区满时同步抛出。该函数被 `phase_started`/`phase_completed`/`branch_evaluated` 监听器调用，异常会经由 `EventEmitter.emit()` 传到 `readyNextPhase()` 调用栈，触发 `runtime-guard` 的 `uncaughtException` → 生产环境 SIGTERM 整服务重启。**单个坏 WS 客户端 → 整服务重启**。

修复后每个 `client.send()` 单独包 try/catch，单个客户端送失败仅 `console.warn`，不影响其他客户端、不影响引擎推进。

### LOW — `lastSampledPV` 真接通
v1.7.0 中 `BatchController.lastSampledPV` 是占位字段，从未被赋值。`tickInternal` 读 PV 后没回写，所以 DAG 分支表达式永远看到空 PV 集 → 走 `default_branch ?? 'false'`。

修复：
1. `lastSampledPV: Record<string, number>` 改为强类型字段
2. `tickInternal` 在 `readProcessValues()` 成功后立刻 `this.lastSampledPV = pv`
3. `readProcessValues` 增加用户面字段别名：`temperature` ← `TEMP_PV`、`pH` ← `PH_PV`、`DO` ← `DO_PV`、`weight` ← `WEIGHT_PV`，与 condition-evaluator 的 ALLOWED_FIELDS 对齐

**仍未解决：** `OD600` 没有对应的 PLC 标签，需后续接入光密度仪硬件。基于 OD600 的分支继续走 `default_branch` 兜底——这是硬件集成而非软件缺陷。

### LOW — 服务器版本字符串读取 `npm_package_version`
- 启动 banner、`/api/v1/status` 响应、`serviceVersion` 默认值都从 `process.env.npm_package_version` 读取，与 `package.json` 自动一致
- 之前三处硬编码 `'0.1.0'` 已修

## Versions Bumped

| File | v1.7.0 | v1.7.1 |
|---|---|---|
| `package.json` (root) | 1.7.0 | **1.7.1** |
| `packages/server/package.json` | 0.3.0 | **0.3.1** |
| `packages/batch-engine/package.json` | 0.2.0 | **0.2.1** |

`web-ui` / `data-service` 不动（无修改）。

## Tests

- 65/65 单测全绿（v1.7.0 64 + 1 新增 lastSampledPV 别名回归测试）
- 全 monorepo build clean
- MOCK_PLC server 启动 clean，banner 显示 `v1.7.1`
- runtime-guard 装载，23/23 migrations 已就位

## Known follow-ups (not in v1.7.1)

| 编号 | 项 | 优先级 | 计划 |
|---|---|---|---|
| F1 | OD600 PLC 接入 | MEDIUM | 客户使用 1-2 周后定，需硬件 |
| F2 | `resumeBatch` 加 server-side caller（启动时扫 `current_node_id`）| MEDIUM | B1.2 之前补 |
| F3 | DEP0169 `url.parse` 警告 | LOW | 升级依赖 |

## Upgrade

```bash
docker compose stop biocore-server
git checkout v1.7.1
docker compose up -d --build biocore-server
```

无 schema 变化，无 migration，**无需停 batch**。
