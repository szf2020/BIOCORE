# BIOCore DAG 运行时（IF/ELSE）— 设计 Spec

> **Track B1.1 — DAG Runtime: IF/ELSE only**
> **创建日期：** 2026-05-01
> **作者：** Claude (brainstorm with kris)
> **目标版本：** v1.7.0
> **预估工时：** 8 天
> **状态：** Spec 待 user review → writing-plans
> **基础：** Sprint 4 Track A 加固已 release（v1.6.0），Sprint 3 已留 DAGExecutor 类 + condition-evaluator + react-flow 编辑器

---

## 0. 背景与目标

Sprint 3 交付了 DAG 数据 schema（migration 007）+ DAGExecutor 类 + react-flow 编辑器 + condition-evaluator，但**运行时 batch-controller 仍走老线性 `phaseIndex`**——编辑器画的 IF/ELSE 节点保存到数据库后，启动批次时被"线性展开"，分支条件**不真正生效**。

B1.1 范围 = 让 react-flow 编辑器画的 IF/ELSE 在生产真正跑起来。

**本 spec 不解决：**
- Loop（repeat-until）节点 — 留 sub-spec B1.2
- Goto（jump-to-node）节点 — 留 sub-spec B1.3
- Sub-recipe（嵌套配方）节点 — 留 sub-spec B1.4
- Branch 中途打断（continuous evaluation）— sub-spec
- Dashboard DAG 可视化 / Edit-v2 运行时高亮 — UI 增强 sub-spec

**成功标准：**
- 老线性配方（schema=1）启动批次行为与 v1.6.0 完全一致（zero regression）
- 含 branch 节点 v2 配方启动后，branch 表达式按当前 PV 求值并选择正确路径
- 进程崩溃后从 `batches.current_node_id` 自动恢复到正确节点
- audit_logs 含 `phase_started` + `branch_evaluated` 事件 with node_id
- 前端 dashboard / batch-detail / audit-logs 三页正确显示 nodeId 而非 phaseIndex

---

## 1. 已确认的关键决策

| # | 决策项 | 选择 | 理由 |
|---|---|---|---|
| 1 | 驱动力 | 真客户/演示需求 IF/ELSE | OD600/pH 类决策已有具体场景 |
| 2 | 迁移期 | **可停产升级**，一次切干净 | 无双引擎共存，代码只剩一条路径 |
| 3 | Branch 范围 | 仅 IF/ELSE（B1.1）；Loop/Goto/SubRecipe 留 sub-spec | YAGNI；先 ship 一个 ship 实在的 |
| 4 | v1 配方兼容 | 启动时 `linearToDag` **内存转换**；运行时统一一条路径 | 零数据库迁移，老配方对运行时透明 |
| 5 | Branch 求值时机 | **Phase 完成时一次求值**（Sprint 3 一致） | phase 状态机不变，最低风险；中途打断留 sub-spec |
| 6 | phaseIndex 暴露 | **全替换为 currentNodeId**；前端 + audit + WS 都改 | 一鼓作气；Loop/Goto 后续不再改一次 |
| 7 | 崩溃恢复 | `batches` 表加 `current_node_id` 列（单一 source of truth）；phaseStatuses 重启重建 | 单 ALTER ADD COLUMN，O(1) 安全升级 |

---

## 2. 实施路径：内核外溢（Path 1）

15 step 自底向上，每 step 一个 commit + test，subagent-driven 友好。

```
Step 1: migration 023 加 current_node_id 列
Step 2: BatchController 加 dagExecutor / dag 字段（暂不启用）
Step 3: phaseStatuses 数组 → Map<nodeId, PhaseStatus>
Step 4: linearToDagIfNeeded + dagExecutor 接入推进逻辑
Step 5: 公共 API 签名改 (startPhase/holdPhase/skipPhase 接 nodeId)
Step 6: step-engine 接 currentPhaseNode + 验证不依赖外部 index
Step 7: server 路由调用方更新
Step 8: audit_logs 写入语义改 + target_kind 列 + branch_evaluated 事件
Step 9: WS broadcast payload 改 + payload_version=2
Step 10: resumeBatch + 崩溃恢复路径 + null 兜底
Step 11: 单测增量 (12 个)
Step 12: 端到端 b1-e2e.sh (8 场景)
Step 13: 前端 4 处改动 (store + dashboard + batch detail + audit-logs)
Step 14: 删老 phaseIndex 路径 + grep 残余
Step 15: 文档
```

每步可独立 build + test，回滚粒度细，编译永远通（Step 5-10 之间公共 API 双存）。

---

## 3. 最终架构形态

```
┌─────────────────────────────────────────────────────────────────────────┐
│  BatchController (v1.6.x → v1.7.0)                                      │
│                                                                         │
│  字段变化：                                                             │
│  - phaseIndex: number              → currentNodeId: string | null       │
│  - phaseStatuses: PhaseStatus[]    → phaseStatuses: Map<nodeId, ...>    │
│  - recipe.phases[]                 → recipe.dag (RecipeDAG)             │
│  + dagExecutor: DAGExecutor                                             │
│  + evalContext: DAGEvalContext (注入到 dagExecutor)                     │
│                                                                         │
│  公共 API 变化：                                                         │
│  - startPhaseByIndex(idx)         → startPhase(nodeId)                  │
│  - holdPhase(idx, reason)         → holdPhase(nodeId, reason)           │
│  - skipPhase(idx)                 → skipPhase(nodeId)                   │
│  + currentNodeId getter                                                 │
│  + currentPhaseNode getter (DAG 节点对象)                               │
│                                                                         │
│  运行时流程：                                                           │
│  1. startRecipe(recipe):                                                │
│     - if recipe.dag_schema_version === 1: dag = linearToDag(phases)     │
│     - else: dag = recipe.dag                                            │
│     - dagExecutor = new DAGExecutor(dag)                                │
│     - dagExecutor.start() → 进入第一个 phase 节点                       │
│     - Map<nodeId, PhaseStatus> 初始化（每个 phase 节点 = pending）      │
│  2. phase 跑完 → advance(evalContext) → 求 branch → 切到下一节点         │
│  3. 每次切换：                                                          │
│     - SQLite UPDATE batches SET current_node_id = ?                     │
│     - audit_logs INSERT { node_id: ..., action: 'phase_started' }       │
│     - WS broadcast { type, batch_id, node_id, phase_id }                │
│  4. 进程崩溃 → 重启后从 batches.current_node_id 恢复                    │
│                                                                         │
│  evalContext 注入字段（已有 condition-evaluator ALLOWED_FIELDS）：      │
│     temperature / pH / DO / OD600 / weight / phase_elapsed_min          │
└─────────────────────────────────────────────────────────────────────────┘

数据流：
  PLC → plc-driver → BatchController.onSample(pv) →
    - 写 phaseStatuses[currentNodeId].lastPV
    - 当 phase 完成（step engine fires phase_complete）：
      → 构造 evalContext: 取最近 PV + phase_elapsed
      → dagExecutor.advance(evalContext)
      → 拿到下一节点 → 进入下个 phase 或 end
```

**关键不变量：**
- 老线性配方（schema=1）DAG 化后跑出与 v1.6.0 **完全相同** 的 phase 顺序
- 只有含 branch 节点的 v2 配方才走真正分支逻辑
- 数据库 schema 变化：**仅** `batches` 表加 `current_node_id` 列；recipes 表不动；audit_logs 加 `target_kind` 列

---

## 4. 数据结构与 API 改动清单

### 4.1 BatchController 字段（packages/batch-engine/src/batch-controller.ts）

| 老字段 | 新字段 | 说明 |
|---|---|---|
| `private phaseIndex = 0` | `private currentNodeId: string \| null = null` | 删除 |
| `private phaseStatuses: PhaseStatus[]` | `private phaseStatuses: Map<string, PhaseStatus>` | nodeId 索引 |
| — | `+ private dagExecutor: DAGExecutor \| null = null` | 新增 |
| — | `+ private dag: RecipeDAG \| null = null` | 新增 |
| `private recipe: Recipe \| null` | 不变 | 仍持有用于元数据 |

### 4.2 公共 API 签名变化

```typescript
// === 老（删除）===
startPhaseByIndex(phaseIndex: number): { success: boolean; message: string }
holdPhase(phaseIndex: number, reason?: string): void
restartPhase(phaseIndex: number): void
skipPhase(phaseIndex: number): void

// === 新 ===
startPhase(nodeId: string): { success: boolean; message: string }
holdPhase(nodeId: string, reason?: string): void
restartPhase(nodeId: string): void
skipPhase(nodeId: string): void

// === 新增 getter ===
get currentNodeId(): string | null
get currentPhaseNode(): DAGPhaseNode | null

// === 新增内部方法 ===
private buildEvalContext(): DAGEvalContext
private linearToDagIfNeeded(recipe: Recipe): RecipeDAG
private rebuildPhaseStatuses(dag: RecipeDAG, currentNodeId: string | null): void
```

### 4.3 PhaseStatus 数据结构变化

```typescript
// 老
interface PhaseStatus {
  index: number;
  state: 'pending' | 'running' | 'held' | 'done' | 'skipped' | 'error';
  hold_reason?: string;
  started_at?: string;
  ended_at?: string;
}

// 新
interface PhaseStatus {
  node_id: string;       // 替代 index
  phase_id: string;      // 配方层 phase_id
  state: 'pending' | 'running' | 'held' | 'done' | 'skipped' | 'error';
  hold_reason?: string;
  started_at?: string;
  ended_at?: string;
}
```

### 4.4 DAGBranchNode 接口扩展

```typescript
// 老（Sprint 3）
export interface DAGBranchNode extends DAGNodeBase {
  type: 'branch';
  expression: string;
}

// 新（B1.1）
export interface DAGBranchNode extends DAGNodeBase {
  type: 'branch';
  expression: string;
  /**
   * 当 PV 中缺失表达式所需字段时的兜底分支（可选）。
   * 不配置时缺失 PV 默认走 false 边 + 写 branch_evaluation_skipped 审计。
   * 配置后缺失 PV 走指定边 + 仍写审计但 result 用 default_branch 值。
   */
  default_branch?: 'true' | 'false';
}
```

老 v2 配方（不含 default_branch）兼容；编辑器加可选下拉框（UI 改动归 B1.1 编辑器小补丁，0.1 天）。

### 4.5 数据库迁移（packages/server/migrations/023-batch-current-node.sql）

```sql
-- B1.1 DAG 运行时 — 持久化 currentNodeId + audit target 类型区分
ALTER TABLE batches ADD COLUMN current_node_id TEXT;

CREATE INDEX IF NOT EXISTS idx_batches_current_node_id
  ON batches(current_node_id) WHERE current_node_id IS NOT NULL;

-- audit_logs 加 target_kind 区分老 phase_index vs 新 node_id
-- 老数据 target_kind = NULL（前端按 NULL = 'phase_index' 渲染）
ALTER TABLE audit_logs ADD COLUMN target_kind TEXT
  CHECK (target_kind IS NULL OR target_kind IN ('phase_index', 'node_id', 'recipe_id', 'batch_id', 'user_id', 'channel_id'));
```

无需重建表；纯 ALTER ADD COLUMN（SQLite 支持，O(1)）。

### 4.6 audit_logs 写入语义

```typescript
// 老
audit.write({ action: 'phase_started', target_id: '2' /* index as string */ })

// 新
audit.write({
  action: 'phase_started',
  target_id: 'n_3',
  target_kind: 'node_id',
  details: { phase_id: 'EXPONENTIAL_GROWTH', phase_type: 'fed-batch' },
})
```

新 actions：
- `phase_started` / `phase_completed` / `phase_held` / `phase_skipped`（已有；target_id 改用 node_id；target_kind = 'node_id'）
- `branch_evaluated`（新）— target_id = branch node id，details = `{ expression, result, pv_snapshot, taken_edge_id }`

### 4.7 WebSocket payload

```typescript
// 老
{ type: 'phase_changed', batch_id: 'B-...', phase_index: 2, phase_id: 'EXPONENTIAL_GROWTH' }

// 新
{
  type: 'phase_changed',
  payload_version: 2,
  batch_id: 'B-...',
  node_id: 'n_3',
  phase_id: 'EXPONENTIAL_GROWTH',
  phase_type: 'fed-batch',
}

// 新增（branch 求值时广播）
{
  type: 'branch_evaluated',
  payload_version: 2,
  batch_id: 'B-...',
  node_id: 'n_branch_5',
  expression: 'OD600 > 5',
  result: true,
}
```

---

## 5. 前端改动清单

### 5.1 packages/web-ui/src/stores/realtime-store.ts

```typescript
// 老
interface BatchRuntimeState {
  batch_id: string;
  phase_index: number;
  phase_id: string;
}

// 新
interface BatchRuntimeState {
  batch_id: string;
  node_id: string;
  phase_id: string;
  phase_type: string;
}
```

WS reducer 检测 `payload_version === 2` 走新 reducer；缺失字段时 fallback 提示用户刷新（升级后浏览器缓存可能命中老 web-ui chunk）。

### 5.2 packages/web-ui/src/app/dashboard/page.tsx

最小改动：把 "Phase 3 / 5" 改为 phase_id + 已运行时间显示。**不**做 DAG 可视化（留 sub-spec）。

### 5.3 packages/web-ui/src/app/batches/[id]/page.tsx

phase 列表改成：

```typescript
const allPhases = getAllPhases(dag);  // DAGExecutor 已有该方法
allPhases.map(node => ({
  node_id: node.id,
  phase_id: node.phase_id,
  phase_type: node.phase_type,
  status: phaseStatuses[node.id],
}))
```

要点：
- branch 路径下 `getAllPhases()` 返回所有可达 phase
- 没走过的 phase 状态为 pending（着灰色）

### 5.4 packages/web-ui/src/app/analysis/audit-logs/page.tsx

- target_id 列：根据 `target_kind` 区分（NULL/phase_index 显示数字；node_id 显示带前缀的字符串）
- 加 `branch_evaluated` 事件渲染（amber 色 + expression + result）

### 5.5 前端工时

| 改动 | 工时 |
|---|---|
| realtime-store.ts | 0.2 天 |
| dashboard/page.tsx | 0.4 天 |
| batches/[id]/page.tsx | 0.5 天 |
| audit-logs/page.tsx | 0.1 天 |
| **合计** | **1.2 天** |

---

## 6. 风险与对策

| ID | 风险 | 概率 | 后果 | 对策 |
|---|---|---|---|---|
| R1 | 老批次（升级前 idle/held）启动时 currentNodeId 为 NULL | 中 | 启动失败或跑错位置 | resumeBatch 检测 NULL → dagExecutor.start() 进入第一节点；audit 写 `batch_resumed_from_null` 警告 |
| R2 | linearToDag 转换 bug 改变老配方语义 | 中 | 生产配方意外变化 | 单测：100 个真实老配方 linearToDag → dagToLinear 反转 → 与原 phases 对比 |
| R3 | branch 求值时 PV 缺失（OD600 还没采到） | 高 | 表达式炸或 false 跳错路径 | evalContext 缺失字段返回 `false`；audit 写 `branch_evaluation_skipped`；branch 节点配置 `default_branch: 'true'\|'false'` 兜底 |
| R4 | batches 表 ALTER COLUMN 在大库锁太久 | 低 | 升级期超时 | SQLite ALTER ADD COLUMN 是 O(1)；100MB 库 < 100ms 实测 |
| R5 | DAG 含环（编辑器漏校验） | 中 | 死循环 | DAGExecutor.advance 用 visited 集合 + 步数上限（默认 10000） |
| R6 | DAG 有 unreachable phase node | 低 | UI 显示乱 | 启动时校验 BV-16；有则拒绝启动并提示 |
| R7 | 多 branch 串联 advance 跳过中间 phase | 低 | 跳过节点 | DAGExecutor.advance 一次只跨 1 个节点（含 branch 也算一步） |
| R8 | phaseStatuses Map GC 压力 | 极低 | 内存稳态高 | 节点数典型 5-20，最多 < 200 |
| R9 | 前端老缓存 phase_index NaN | 中 | 前端报错 | WS payload_version=2 字段；前端 reducer 检测旧字段 fallback；浏览器 build hash 失效 |
| R10 | audit_logs 老数据 target_id 是数字、新数据是 node_id 字符串 | 中 | 查询/统计混乱 | `target_kind` 列区分；前端按 kind 分别渲染 |
| R11 | step-engine 依赖 phase 数组顺序 | 高 | step 推进错乱 | 代码 audit 确认 step-engine 是 phase-scoped；不依赖外部 index — **Step 6 必须显式验证** |
| R12 | Sprint 3 react-flow 编辑器保存的 DAG 不含 start/end 节点 | 中 | linearToDag 不知入口 | DAGExecutor.start() 已处理：找 type=start；若无，取出度=入度=0 但有入度的最早节点（兜底） |

### 6.1 回滚策略

```bash
docker compose stop biocore-server
git checkout v1.6.0
docker compose up -d biocore-server
# batches.current_node_id 列保留（v1.6.0 忽略未知列）
# audit_logs.target_kind 列保留
# v2 含 branch 配方在 v1.6.0 走 Sprint 3 临时方案"线性展开"——和升级前行为相同
```

回滚 = git checkout v1.6.0 + 重启容器，30 秒。无需还原数据库 schema。

---

## 7. 测试策略

### 7.1 测试金字塔

```
                  ┌────────────────────────┐
                  │  集成测试（手动）       │  ~5 个 release 候选时跑
                  └────────────────────────┘
                ┌──────────────────────────────┐
                │  端到端测试（curl + tsx）     │  ~8 个 / PR 跑
                └──────────────────────────────┘
              ┌──────────────────────────────────┐
              │  集成单测 (vitest)               │   ~12 个 / commit 跑
              └──────────────────────────────────┘
              ┌──────────────────────────────────┐
              │  纯单测（已存在 DAGExecutor + condition-evaluator）│   ~25 个（不动）
              └──────────────────────────────────┘
```

### 7.2 单测增量（12 个）

`packages/batch-engine/src/__tests__/batch-controller-dag.test.ts`：

| 场景 | 断言 |
|---|---|
| linearToDag 后跑老线性配方与原行为一致 | phase 顺序、phase_id 序列、状态转换序列一致 |
| 含 branch 节点 v2 配方 — branch=true 路径 | OD600>5 走 true 边 |
| 含 branch — branch=false 路径 | OD600<=5 走 false 边 |
| advance 时 PV 缺失（未采到 OD600） | 返回 false + 写 `branch_evaluation_skipped` |
| advance 时 default_branch 兜底 | PV 缺失但配置了 default_branch=true → 走 true 边 |
| holdPhase / restartPhase / skipPhase 用 nodeId | API 行为正确 |
| phaseStatuses Map 索引 | get/set/iterate 在 nodeId 上行为正确 |
| 进程崩溃恢复 — 从 batches.current_node_id 还原 | resumeBatch 拿 nodeId → 进入正确 phase |
| 进程崩溃恢复 — current_node_id IS NULL | 调 dagExecutor.start() 进入第一节点 |
| DAG 含环 | DAGExecutor.advance 抛 MaxStepsExceeded |
| DAG unreachable phase | startRecipe 拒绝（BV-16） |
| 多 branch 串联 advance | 一次推进一个节点（含 branch） |

### 7.3 端到端（8 个）

`scripts/b1-e2e.sh` 参考 sprint3-e2e.sh：

```
1. 创建 v2 DAG 配方含 1 branch (OD600 > 5)
2. 启动批次，初始 PV 全 0
3. advance 第一 phase → 验证 batches.current_node_id 已更新
4. 模拟 PV 推送 (mock-plc OD600 = 6)
5. advance 第二 phase (branch 节点) → 验证走 true 边
6. WS 监听 → 收到 phase_changed + branch_evaluated 两条事件
7. 拉 audit_logs → branch_evaluated 行 details 含 expression + result + pv_snapshot
8. 故意 kill server → 重启 → 验证从 current_node_id 续跑
```

### 7.4 集成测试（5 个 release 候选时）

| 场景 | 验证 |
|---|---|
| 老 ECOLI_V1 启动批次 | 不走任何 branch，phase 顺序与升级前完全一致 |
| 升级期间已存在 idle 批次 | current_node_id IS NULL → fallback 进入第一节点 |
| 升级期间已存在 running 批次 | 用户必须先停掉再升级（决策 #2） |
| 24h MOCK_PLC 跑含 branch v2 配方 | 全程不崩；branch 求值正常；前端正确显示 |
| 触发 OOM（NODE_ENV=production） | 重启后从 current_node_id 自动续跑 |

### 7.5 通过门槛

| 阶段 | 门槛 |
|---|---|
| commit | 全 monorepo `pnpm test` 100% 绿（增量 12 + 已有 ≥ 53） |
| PR | b1-e2e.sh 8 场景全过 |
| release | 5 集成场景全过 + 24h soak 通过 + 文档 review |
| 用户验收 | 实验室真机演示：画含 branch 的 DAG → 启动批次 → branch 求值正确 |

---

## 8. 工时与 release 计划

### 8.1 路径 1（内核外溢）每 step 工时

| Step | 内容 | 工时 |
|---|---|---|
| 1 | migration 023 加 current_node_id 列 + index | 0.2 天 |
| 2 | BatchController 加 dagExecutor / dag 字段（暂不启用） | 0.2 天 |
| 3 | phaseStatuses 数组 → Map<nodeId> | 0.5 天 |
| 4 | linearToDagIfNeeded + dagExecutor 接入推进逻辑 | 1 天 |
| 5 | 公共 API 改签名（startPhase/holdPhase/skipPhase 接 nodeId） | 0.5 天 |
| 6 | step-engine 接 currentPhaseNode + 验证不依赖外部 index | 0.3 天 |
| 7 | server 路由调用方更新 | 0.5 天 |
| 8 | audit_logs 写入语义改 + target_kind 列 + branch_evaluated 事件 | 0.5 天 |
| 9 | WS broadcast payload 改 + payload_version=2 | 0.3 天 |
| 10 | resumeBatch + 崩溃恢复 + null 兜底 | 0.5 天 |
| 11 | 单测增量（12 个） | 1 天 |
| 12 | 端到端 b1-e2e.sh（8 场景） | 0.5 天 |
| 13 | 前端 4 处改动 | 1.2 天 |
| 14 | 删老 phaseIndex 路径 + grep 残余 | 0.3 天 |
| 15 | 文档（部署说明 §12 + 加固SOP §11 + release notes） | 0.5 天 |
| **合计** | | **8 天** |

### 8.2 文档产出

| 文档 | 内容 | 位置 |
|---|---|---|
| 本 spec | B1.1 设计 | `docs/superpowers/specs/2026-05-01-dag-runtime-design.md` |
| plan | 15 step + TDD 步骤 | `docs/superpowers/plans/2026-05-01-dag-runtime-plan.md` |
| 部署说明 §12 | Recipe DAG 运行时 + 配方迁移注意 | 既有文件 |
| 加固SOP §11 | Branch 求值故障排查 / current_node_id 异常恢复 | 既有文件 |
| RELEASE_NOTES_v1.7.0.md | DAG runtime release | 新建 |

### 8.3 版本与 Release

- 本 spec 落地后版本号：**v1.7.0**（minor — 新功能 + schema 加列，向后兼容）
- migration 023 = 单 ALTER ADD COLUMN（O(1)，安全）
- **升级前提：无 running 批次**（决策 #2）— release notes 明示
- 老配方（schema=1）100% 兼容
- v2 含 branch 配方升级后**自动启用**，无 feature flag

### 8.4 后续 sub-spec 队列

完成 B1.1 + 客户使用 1-2 周后再决定：

- **B1.2 Loop 节点**（如客户反馈"需要重复直到稳定"）— 3-4 天
- **B1.3 Goto 节点**（如反馈"故障跳应急流程"）— 3-4 天
- **B1.4 Sub-recipe**（如反馈"灭菌流程要复用"）— 5-7 天

每个 sub-spec 独立 brainstorm → spec → plan → impl。

---

## 9. 不在 B1.1 范围（YAGNI 切除）

- ❌ Loop / Goto / Sub-recipe 节点（B1.2 / B1.3 / B1.4）
- ❌ Branch 中途打断（continuous mode；sub-spec）
- ❌ Dashboard DAG 可视化（递归节点链渲染；UI sub-spec）
- ❌ Edit-v2 运行时 nodeId 高亮（UI sub-spec）
- ❌ Branch 求值历史专门页（如要做加在 audit-logs 过滤即可）
- ❌ Audit-logs 老数据迁移（target_kind 加列即可，老数据不动）
- ❌ 双引擎共存 / feature flag 切流（决策 #2 已否决）
- ❌ Recipe 老 phases 字段从数据库删除（独立 cleanup spec，等 v1 配方都迁移完再做）

---

## 10. Spec 状态

**待 user review。** 用户确认后进入 writing-plans skill，产出 implementation plan。
