# BIOCore v1.7.2 — Crash-Recovery Wiring + Listener Hardening

**Release Date:** 2026-05-02
**Type:** Patch release on top of v1.7.1
**Tag:** `v1.7.2`

## TL;DR
v1.7.0 加了崩溃恢复的持久化基础（migration 023 + `resumeBatch` + `persistCurrentNodeId`），但 server 启动时**从未读它**——遗留批次默默丢失。v1.7.2 接通这条线，并补全二轮审计漏掉的另一个 emit listener crash 路径。

## Fixes

### HIGH — 崩溃恢复 boot 扫描
v1.7.0 设计意图：server 重启后扫 `batches` 表里 `current_state ∈ {running, held, paused}` 的行，调用 `resumeBatch` 恢复。**实际实现：从未发生**。客户跑 24h 批次中途崩溃 → 重启后 DB 里 `current_state='running'` 还在，但没人读它，引擎是空闲的，操作员不知道批次"丢了"。

修复策略（**保守安全优先**）：
- server `listen()` 启动后扫 `getOrphanBatches()` (status ∈ {running, held, paused})
- 每个遗留批次 `markBatchHeldForRecovery(batchId, 'server_restart_recovery@<timestamp>')` → `current_state='held'` + `hold_reason` 写明
- 写一行 `audit_logs` (`action='batch_held_for_recovery'`，full metadata 在 `new_value` JSON)
- console 输出 `[BOOT] 检测到 N 个遗留批次` 警告
- **不**自动 resume 引擎 —— 24h 发酵不能在无操作员确认下静默续跑（PV 可能已飘、报警可能漏过）。Held 批次会出现在 UI 的 hold 队列，等操作员手动续跑/中止。

### HIGH — emit listener 副作用全员 try/catch
二轮审计发现 `state_changed` / `batch_completed` / `batch_stopped` 监听器中的 CUSUM 调用裸抛——任一抛出会经 `actor.subscribe → EventEmitter.emit → uncaughtException` 触发 runtime-guard SIGTERM。v1.7.1 修了 `broadcast()`，**但没覆盖这条路径**。

修复：
- `state_changed` 监听器中的 `getCusumKey + initCusumBaselines` 包 try/catch
- `batch_completed` 监听器中的 `clearCusumDetectors` 包 try/catch
- `batch_stopped` 监听器中的 `clearCusumDetectors` 包 try/catch

任一失败仅 `console.warn/error`，不打断 emit 链。

## Versions Bumped

| File | v1.7.1 | v1.7.2 |
|---|---|---|
| `package.json` (root) | 1.7.1 | **1.7.2** |
| `packages/server/package.json` | 0.3.1 | **0.3.2** |
| `packages/data-service/package.json` | 0.1.2 | **0.1.3** |

`web-ui` / `batch-engine` 未变。

## API additions

`packages/data-service`:
- `getOrphanBatches(db) → OrphanBatchRow[]` — 返回 status ∈ {running, held, paused} 的批次，含 `current_node_id` 等元数据
- `markBatchHeldForRecovery(db, batchId, reason)` — 设置 `current_state='held'` + `hold_reason`
- 类型导出：`OrphanBatchRow`

## Tests

- batch-engine: **65/65 ✓**（v1.7.1 baseline 不变）
- data-service: **+4 新测**（boot-recovery.test.ts，全过；预存 16 失败不在本次修复范围）
- 全 monorepo build clean
- MOCK_PLC server 启动验证：`[BOOT] 无遗留批次需恢复` 输出正常，banner 显示 `v1.7.2`

## Operator workflow change

服务重启后第一件事：
1. 看 server 启动日志的 `[BOOT]` 行
2. 若有遗留批次 → 在 UI hold 队列查看 → 决定 resume 或 abort
3. resume 流程目前仍需手动操作（B1.2 之前补全自动 resume 是 follow-up）

## Known follow-ups

| 编号 | 项 | 计划 |
|---|---|---|
| F1 | OD600 PLC 接入 | 客户使用 1-2 周后定，需硬件 |
| F2-AUTO | UI 一键 "Resume" 按钮调 `resumeBatch` + 启动引擎 | B1.2 之前补 |
| F3 | DEP0169 `url.parse` warning | 依赖升级 |

## Upgrade

```bash
docker compose stop biocore-server
git checkout v1.7.2
docker compose up -d --build biocore-server
# 看启动日志: [BOOT] 0 或 [BOOT] N 遗留批次
```

无 schema 变化，无 migration。
