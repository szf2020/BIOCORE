# BIOCore v1.14.0 — B1.2 Loop Nodes

**Release Date:** 2026-05-02
**Type:** Feature — DAG runtime expansion
**Tag:** `v1.14.0`

## TL;DR

第 5 个 DAG 节点类型上线 — **`DAGLoopNode`** 实现 repeat-until + fixed-N 循环。基于 v1.10.0 P3 的 LoopFrame 帧栈基础设施。复用 v1.11.0 Goto 的 back-edge 机制 + `maxRevisits` 安全网。覆盖 ~90% 的发酵 SOP 实战循环用例（"采样 N 次 / 直到 OD 达标 / 二选一组合"）。

## Spec（B1.2 brainstorm 锁定）

| Q | 决策 |
|---|---|
| Q1 探索深度 | minimum viable / 纯探索 |
| Q2 语义 | A + C 合并：repeat-until + fixed-N（单一 DAGLoopNode 类型）|
| Q3 拓扑 | α back-edge（复用 v1.11.0 Goto 机制 + visitCount）|
| Q4 检查时机 | end-of-iteration |
| Q5 嵌套深度 | 1（不允许嵌套；validator BV-24 拒）|
| Q6 持久化 | JSON 列（`batches.current_loop_frames TEXT NULL`）|

Open Questions 锁定：
- (i) `exitExpression` 求值抛错 → 继续 body 迭代（fail-loud over silent early-exit）
- (vi) Auto-ceiling = `max(用户显式 maxRevisits, max-of-loop-maxIterations, 1000-floor-when-loop-exists)` — 永不降低用户显式值

## 4 Commits

| # | Commit | LOC | Tests Δ |
|---|---|---:|---:|
| 1 | `e7aeff5` `feat(batch-engine): DAGLoopNode + executor wiring` | +88p / +211t | +11 |
| 2 | `c526c10` `feat(batch-engine): validator BV-22..BV-25` | +91p / +167t | +11 |
| 3 | `b3029e6` `feat(server,data-service): migration 024 + persistence + resumeBatch` | +155p / +268t | +9 |
| 4 | `3df4e33` `feat(web-ui,server): LoopNode editor + audit/WS bridge` | +346p / +113t | +3 |
| **Bundled fix** | `e3ebf14` `fix(server): wire registerAuditLogRoutes (v1.13.0 regression)` | +2 | 0 |

总 production +680 / test +759 / 1 regression fix.

## Schema

```ts
DAGLoopNode {
  id: string
  type: 'loop'
  exitExpression?: string  // condition-evaluator 表达式（同 IF/ELSE branch DSL）
  maxIterations?: number   // > 0; 至少 exitExpression 或 maxIterations 之一
}
```

每个 Loop 节点有 **2 条 out-edge**：
- `body` — 继续迭代，进入循环体
- `exit` — 退出循环

Body 末尾节点画一条 back-edge 接回 Loop 节点（react-flow 中正常画一条边即可）。

`DAGEdge.label` union 扩展：`'true' | 'false' | 'body' | 'exit'`。

## 运行时

- **首次进入 Loop 节点**（栈无 frame）：push `{loopNodeId, iteration: 0, exitExpression, maxIterations}`，走 `body`
- **back-edge 回到 Loop 节点**：iteration++，**end-of-iteration check**：
  1. `iteration >= maxIterations` → pop frame，走 `exit`
  2. `evaluateExpression(exitExpression) === true` → pop frame，走 `exit`
  3. `evaluateExpression` 抛错（PV 缺失/parse 错）→ 走 `body`（继续，安全默认）
  4. 否则 → 走 `body`
- DAG 含 loop 节点时，`maxRevisits` 自动提升到 `max(用户显式, max-of-loop-maxIterations, 1000)`，作为 visitCount 防爆兜底

## 持久化

- **Migration 024** (`024-batch-loop-frames.sql`)：`batches` 表加 `current_loop_frames TEXT NULL` 列
- BatchController 在 `start / readyNextPhase / reset` 后调用 `persistLoopFrames()` 写 JSON.stringify(frames) 或 NULL
- `resumeBatch(batchId, recipe, savedNodeId, savedFrames?)` 接收 saved frames，调用 `dagExecutor.restoreFrames(savedFrames)` 在 start() 清栈后恢复
- `resumeAndStart` 转发 savedFrames 参数；F2-AUTO `tryAutoResumeOrphan` 读 `current_loop_frames` 列，`safeParseFrames` try/catch + 形状校验降级处理 corrupt JSON

## Validator (新增 4 条规则)

- **BV-22**：Loop 节点必须 exitExpression 或 maxIterations(>0) 至少一个
- **BV-23**：Loop 节点必须正好 2 条 out-edge，标签 `{body, exit}`
- **BV-24**：Loop body 子图（从 `body` out-edge 前向 BFS）内不可含另一 loop 节点（depth=1）
- **BV-25**：Loop 必须有至少一条 back-edge（body-reachable 节点指回 loop 节点 id）

**BV-15 cycle suppression 重构**：合并 goto 出边和 loop back-edges 为统一的 suppressed-edge-ID Set；新 helper `getLoopBodyReachable` 共享给 BV-24/BV-25/BV-15.

## Editor（web-ui）

- 新 palette 按钮「Loop 循环」（teal-500）
- `LoopNode.tsx` react-flow 组件 — `Repeat` icon，双 source handles（id="body" + id="exit"，垂直分隔）
- `NodeInspector` loop 分支 — `exitExpression` 文本 + `maxIterations` 数字，inline 红色提示"必须至少设置..."
- `flowToDag` / `dagToFlow` 同步 sourceHandle ↔ edge label
- 客户端 `validateDag` 镜像 BV-22..25
- MiniMap 配色 teal `#14b8a6`

## Audit / WS Events（新增 3 类）

`BatchController.readyNextPhase` 在 advance 循环前后 snapshot frame top，触发对应事件：

- **`loop_entered`** — frame 新 push（top.loopNodeId 由 undefined → defined 或 切换）
- **`loop_iterated`** — 同 loopNodeId，iteration 自增
- **`loop_exited`** — frame pop（top.loopNodeId 由 defined → undefined 或 切换）

每事件经 `reactor-wiring.ts` 3 个新 listener：
- `broadcast('loop_*', {reactor_id, payload_version: 2, batch_id, node_id, iteration, maxIterations, exitExpression}, batch_id, reactorId)`
- `getAuditQueue().enqueue({user_id: 'system', action: 'loop_*', target_type: 'loop', target_id: node_id, target_kind: 'node_id', batch_id, new_value: JSON.stringify(...)})`

监听器全 try/catch 包裹（v1.7.1 listener-hardening pattern）。

## Tests

| 包 | v1.13.0 | v1.14.0 | Δ |
|---|---:|---:|---:|
| batch-engine | 120 | **151** | +31 |
| data-service | 19 / 16 fail | 22 / 16 fail | +3 / 0 |
| server | 28 | **28** | 0 |
| **合计 active** | **167** | **201** | **+34** |

新增测试覆盖：
- DAGExecutor: 11 tests（first entry / re-entry iter inc / fixed-N exit / repeat-until exit / PV-missing 续 / combined / auto-ceiling / start clears / snapshot mid-iter）
- Validator: 11 tests（BV-22..25 各路径 + BV-15 cycle 抑制 + valid 用例）
- BatchController persistence: 6 tests（start null / readyNextPhase serialize / reset clears / resumeBatch restores / resumeBatch back-compat / resumeAndStart forwards）
- BatchController events: 3 tests（loop_entered/iterated/exited 触发与 payload）
- Data-service: 3 tests（migration 024 列存在 / round-trip / corrupt JSON 返 null）

## Bonus 修复（in scope of B1.2 work）

1. **B1.1 latent bug**: `BatchControllerConfig.persist.updateCurrentNodeId` 自 v1.7.0 声明但**从未在 server 端 wire** — 生产里 `current_node_id` 列一直 NULL，F2-AUTO crash recovery (v1.12.0) 从 saved nodeId 续跑实际上是断的。Commit 3 顺手 wire（同时引入 `updateLoopFrames`）。
2. **`dagToLinear` 静默 bug**：自 v1.11.0 Goto 起，含 goto 节点的 DAG 走 `dagToLinear` 会按 `outEdges[0].to` 错误线性化。Commit 1 加 explicit throw（goto + loop 都不能线性化）。
3. **v1.13.0 regression** (`e3ebf14`)：commit `a6e62c1` 把 `/audit-logs` 路由从 index.ts 抽到 audit-log-routes.ts 但**忘了 import + 调用 `registerAuditLogRoutes`**，导致 `GET /audit-logs` 在生产 404。v1.13.0 release notes 的 "✓ /audit-logs?limit=5 returns 200" 说法不实。本 release 顺手修。

## Verification

**单测全绿:** batch-engine 151/151 / data-service 22/22 active / server 28/28.

**Live smoke:**
```
[Migrator] 待执行 1 个 migration: 024-batch-loop-frames
[Migrator] ✓ 1 个 migration 执行成功
[BOOT] 无遗留批次需恢复

curl /api/v1/admin/health/liveness         → 200 ✓
curl POST /api/v1/auth/login                → 200, token len 255 ✓
curl /api/v1/recipes                        → 200 ✓（旧配方仍正常加载）
curl /api/v1/reactors                       → 200 ✓
curl /api/v1/audit-logs?limit=5             → 200 ✓（v1.13.0 regression 已修）
```

## Versions Bumped

| File | v1.13.0 | v1.14.0 |
|---|---|---|
| `package.json` (root) | 1.13.0 | **1.14.0** |
| `packages/server/package.json` | 0.5.0 | **0.6.0** |
| `packages/batch-engine/package.json` | 0.3.2 | **0.4.0** |
| `packages/data-service/package.json` | 0.1.4 | **0.2.0** |
| `packages/web-ui/package.json` | 0.3.2 | **0.4.0** |

## 兼容性

- **DB**：旧 DB 升级后 `current_loop_frames` 自动 NULL；helper 经 try/catch 优雅退化
- **旧配方**：无 loop 节点的 DAG 行为完全等价 v1.13.0
- **资源占用**：B1.1 bug 修后，`current_node_id` 列首次实际写入 — 略微增加 SQLite 写频率，但仍在 audit-queue (~50/sec) 容量内
- **PUBLIC_PATHS**：未变；不引入新公开端点

## Anti-Spec（B1.2 之外，留给后续 release）

- 嵌套 loops（depth>1）— 留待真实工艺需求驱动
- Time-bounded loops（startedAt + maxDurationMs）— LoopFrame 字段已留作 forward-compat，未连线
- Convergence-detection loops — 需 per-frame state，主要 effort
- Loop iteration timeline UI — audit 数据已捕，前端 `<LoopIterationTimeline>` 待加
- B1.4 Sub-recipe — 复用 LoopFrame 栈（discriminated union）

## Path Forward

| 项 | 状态 |
|---|---|
| B1.1 IF/ELSE | ✅ v1.7.0 |
| B1.2 Loop | ✅ **v1.14.0** |
| B1.3 Goto | ✅ v1.11.0 |
| B1.4 Sub-recipe | 待启动（5-7d，需 B1.2 frame stack — 已就绪）|
| F1 OD600 PLC tag | 等硬件 |
| F3 url.parse 弃用 | 第三方 dep 升级 |
| audit_logs archive | P1 deferred；触发条件未到 |
| plc-driver exports map | P1 deferred；~1d |
| route-handler-split P2/P3 | 未排期；非阻塞 |

## 升级

```bash
docker compose stop biocore-server
git checkout v1.14.0
docker compose up -d --build biocore-server
```

无需手动 schema 迁移 — migrator 自动应用 024。
