# BIOCore v1.7.0 — DAG Runtime Release

**Release Date:** 2026-05-01
**Sprint:** Sprint 5 Track B1.1
**Tag:** `v1.7.0`
**Spec:** `docs/superpowers/specs/2026-05-01-dag-runtime-design.md`

## TL;DR
React-flow 编辑器画的 IF/ELSE 节点在生产真正生效。

## What's New
- BatchController 升级到 DAG 运行时（自底向上的 Path 1 内核外溢）
- v1（线性）配方自动 `linearToDag` 兼容，运行时统一走 DAGExecutor
- `batches.current_node_id` 持久化崩溃恢复（migration 023）
- `audit_logs.target_kind` 区分 `phase_index` / `node_id` 等
- WS payload v2：`payload_version: 2` + `node_id` + `phase_type`
- 新事件 `branch_evaluated`：审计 + WS 广播，含 PV 快照
- Editor: branch 节点加 `default_branch: 'true' | 'false'` 兜底下拉
- Dashboard 显示 phase_id（不再是 phase_index）
- Batch detail 列表从 DAG 节点派生
- Audit logs 渲染 target_kind + branch_evaluated 行（amber）

## Breaking Changes
- 升级前必须无 running 批次
- WS payload `phase_index` 字段已移除（前端需 reload 浏览器）
- API: `/reactors/:reactorId/phases/:idx` 数字路径已删；改用 `:nodeId`（如 `n_3`）
- 公共方法 `startPhaseByIndex` / `holdPhaseByIndex` / `skipPhaseByIndex` / `restartPhaseByIndex` 已删；改用 nodeId 版本

## Migrations
- `023-batch-current-node.sql`（自动应用）

## Statistics
- 25 commits（T1-T24 + T25）
- 64 单测全绿（baseline 53 + 11 新增）
- 全 monorepo build clean
- 工时实际：~8 天计划，subagent-driven 加速

## Upgrade

```bash
docker compose stop biocore-server  # 确保所有反应器 idle
git checkout v1.7.0
docker compose up -d --build biocore-server
```

或 NSSM/systemd 部署：

```bash
nssm stop biocore
git checkout v1.7.0
pnpm -r build
nssm start biocore
```

## Rollback (30s)

```bash
docker compose stop biocore-server
git checkout v1.6.0
docker compose up -d biocore-server
# batches.current_node_id 列保留（v1.6.0 忽略未知列）
# v2 含 branch 配方在 v1.6.0 走 Sprint 3 临时方案"线性展开"
```

## What's Next (Sprint 5 backlog)

完成 B1.1 + 客户使用 1-2 周后再决定：
- B1.2 Loop 节点（如客户反馈"需要重复直到稳定"）— 3-4 天
- B1.3 Goto 节点（如反馈"故障跳应急流程"）— 3-4 天
- B1.4 Sub-recipe（如反馈"灭菌流程要复用"）— 5-7 天
