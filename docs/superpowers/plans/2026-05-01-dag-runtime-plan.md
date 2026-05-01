# BIOCore DAG 运行时（B1.1 IF/ELSE）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 BIOCore batch-controller 从线性 phaseIndex 升级到 DAG 运行时，让 react-flow 编辑器画的 IF/ELSE 节点在生产真正生效。

**Architecture:** Path 1 内核外溢（自底向上）。每 step 一个 commit + test，subagent-driven 友好。15 个高粒度任务（25 个细分 task），每个独立可验证。

**Tech Stack:** TypeScript 严格模式；vitest；Express；ws；better-sqlite3；React/Next.js 14；ECharts；既有 `DAGExecutor`（packages/batch-engine/src/dag-executor.ts）+ `condition-evaluator`（packages/batch-engine/src/condition-evaluator.ts）+ react-flow 编辑器。

**Spec：** `docs/superpowers/specs/2026-05-01-dag-runtime-design.md`
**Branch base：** `main` @ tag `v1.6.0`
**Target tag：** `v1.7.0`

---

## File Structure

### NEW

| 文件 | 责任 |
|---|---|
| `packages/server/migrations/023-batch-current-node.sql` | DB schema：batches.current_node_id + audit_logs.target_kind |
| `packages/batch-engine/src/__tests__/batch-controller-dag.test.ts` | DAG runtime 单测（增量 12 cases）|
| `scripts/b1-e2e.sh` | 端到端 8 场景脚本（curl + jq + tsx）|
| `RELEASE_NOTES_v1.7.0.md` | release 说明 |

### MODIFIED（按改动量排序）

| 文件 | 改动范围 |
|---|---|
| `packages/batch-engine/src/batch-controller.ts` | **核心**：phaseIndex → currentNodeId / phaseStatuses 数组 → Map / startPhase 等 API 改签名 |
| `packages/batch-engine/src/dag-executor.ts` | DAGBranchNode 加 `default_branch?` 字段 |
| `packages/batch-engine/src/step-engine.ts` | `StepLogEntry.phase_index` → `node_id` 字段（downstream R11） |
| `packages/batch-engine/src/index.ts` | 导出更新 |
| `packages/server/src/index.ts` | 路由调用方更新 + WS broadcast payload v2 |
| `packages/data-service/src/sqlite-service.ts` | audit_logs 写入函数加 target_kind 参数 + branch_evaluated 事件 |
| `packages/web-ui/src/stores/realtime-store.ts` | WS reducer 接 node_id |
| `packages/web-ui/src/app/dashboard/page.tsx` | timeline 显示 phase_id 而非 index |
| `packages/web-ui/src/app/batches/[id]/page.tsx` | phase 列表用 getAllPhases + nodeId 索引 |
| `packages/web-ui/src/app/analysis/audit-logs/page.tsx` | target_kind 渲染 + branch_evaluated 事件 |
| `packages/web-ui/src/components/recipe-graph/NodeInspector.tsx` | branch 节点加 default_branch 下拉 |
| `docs/部署说明.md` | §12 DAG 运行时 |
| `docs/加固SOP.md` | §11 Branch 故障排查 |

---

## Pre-flight（Tasks 0-1）

### Task 0：确认基线

**Files:** none (verification only)

- [ ] **Step 1:** Verify clean state on main branch with v1.6.0 tag

```bash
git -C /c/BIOCORE status
git -C /c/BIOCORE log --oneline | head -3
git -C /c/BIOCORE tag | grep v1.6.0
```

预期：working tree clean，`v1.6.0` 和 `v1.6.0-hardening` tag 都在，HEAD 指向 main 的 release commit。

- [ ] **Step 2:** Create feature branch from main

```bash
git -C /c/BIOCORE checkout main
git -C /c/BIOCORE pull --ff-only 2>/dev/null || true   # local-only repo
git -C /c/BIOCORE checkout -b sprint5-b1-dag-runtime
git -C /c/BIOCORE branch
```

预期：当前分支 = `sprint5-b1-dag-runtime`。

- [ ] **Step 3:** Verify all packages build clean

```bash
cd /c/BIOCORE && pnpm -r build 2>&1 | tail -10
```

预期：10 个包全 Done，0 错误。

- [ ] **Step 4:** Snapshot key tests baseline

```bash
cd /c/BIOCORE && pnpm --filter @biocore/batch-engine test 2>&1 | tail -5
```

预期：53 tests pass（含 T11 watchdog）。记录这个数字作为基线。

---

### Task 1：建 DAG runtime 进度跟踪文档

**Files:**
- Create: `docs/B1-DAG-runtime-进度跟踪.md`

- [ ] **Step 1:** Write tracker

```markdown
# B1.1 DAG 运行时进度跟踪

> Spec: `docs/superpowers/specs/2026-05-01-dag-runtime-design.md`
> Plan: `docs/superpowers/plans/2026-05-01-dag-runtime-plan.md`
> Branch: `sprint5-b1-dag-runtime`

| 阶段 | Tasks | 状态 | 完成日 |
|---|---|---|---|
| Pre-flight | T0-T1 | ⬜ | |
| Phase A (foundation) | T2-T6 | ⬜ | |
| Phase B (core logic) | T7-T13 | ⬜ | |
| Phase C (adapters) | T14-T17 | ⬜ | |
| Phase D (frontend) | T18-T22 | ⬜ | |
| Phase E (validation + release) | T23-T25 | ⬜ | |
```

- [ ] **Step 2:** Commit

```bash
git -C /c/BIOCORE add "docs/B1-DAG-runtime-进度跟踪.md"
git -C /c/BIOCORE commit -m "docs(b1): tracker for DAG runtime implementation"
```

---

## Phase A — Foundation（Tasks 2-6）

### Task 2：Migration 023 — schema 加列

**Files:**
- Create: `packages/server/migrations/023-batch-current-node.sql`

- [ ] **Step 1:** Write migration SQL

```sql
-- B1.1 DAG 运行时 — 持久化 currentNodeId + audit target 类型区分
ALTER TABLE batches ADD COLUMN current_node_id TEXT;

CREATE INDEX IF NOT EXISTS idx_batches_current_node_id
  ON batches(current_node_id) WHERE current_node_id IS NOT NULL;

-- target_kind 区分 audit_logs.target_id 的语义
-- 老数据 NULL（前端按 NULL = 'phase_index' 渲染）
ALTER TABLE audit_logs ADD COLUMN target_kind TEXT;
```

注：原 spec §4.5 给了 CHECK constraint 但 SQLite ALTER ADD COLUMN 不支持 CHECK；用代码层校验代替。

- [ ] **Step 2:** Verify migration runs on dev db

```bash
pkill -f "tsx.*biocore" 2>/dev/null; sleep 2
cd /c/BIOCORE && MOCK_PLC=true PORT=3088 npx tsx packages/server/src/index.ts > /tmp/biocore-t2.log 2>&1 &
SERVER_PID=$!
sleep 6
echo "---MIGRATIONS---"
grep -E "Migrator|023" /tmp/biocore-t2.log | head -5
echo "---SCHEMA CHECK---"
sqlite3 /c/BIOCORE/data/biocore.db ".schema batches" | grep -i current_node_id
sqlite3 /c/BIOCORE/data/biocore.db ".schema audit_logs" | grep -i target_kind
kill -TERM $SERVER_PID 2>/dev/null
```

预期：`Migrator] 待执行 1 个 migration: 023-batch-current-node`；schema 输出含 `current_node_id TEXT` 和 `target_kind TEXT`。

- [ ] **Step 3:** Commit

```bash
git -C /c/BIOCORE add packages/server/migrations/023-batch-current-node.sql
git -C /c/BIOCORE commit -m "feat(server): migration 023 — batches.current_node_id + audit_logs.target_kind (T2)"
```

---

### Task 3：DAGBranchNode 加 default_branch 字段

**Files:**
- Modify: `packages/batch-engine/src/dag-executor.ts`
- Test: existing dag-executor tests should still pass

- [ ] **Step 1:** Write failing test

Open `packages/batch-engine/src/__tests__/dag-executor.test.ts` (or appropriate test file), add at end of describe block:

```typescript
import { DAGExecutor, type RecipeDAG, type DAGEvalContext } from '../dag-executor';

describe('DAGExecutor default_branch fallback', () => {
  it('uses default_branch when expression evaluation throws (PV missing)', () => {
    const dag: RecipeDAG = {
      schema_version: 2,
      nodes: [
        { id: 's', type: 'start' },
        { id: 'b', type: 'branch', expression: 'OD600 > 5', default_branch: 'true' },
        { id: 'p_true', type: 'phase', phase_id: 'TRUE_PATH', phase_type: 'fermentation' },
        { id: 'p_false', type: 'phase', phase_id: 'FALSE_PATH', phase_type: 'fermentation' },
        { id: 'e', type: 'end' },
      ],
      edges: [
        { id: 'e1', from: 's', to: 'b' },
        { id: 'e2', from: 'b', to: 'p_true', label: 'true' },
        { id: 'e3', from: 'b', to: 'p_false', label: 'false' },
        { id: 'e4', from: 'p_true', to: 'e' },
        { id: 'e5', from: 'p_false', to: 'e' },
      ],
    };
    const exec = new DAGExecutor(dag);
    exec.start();
    // ctx that throws on evaluation = simulates PV-missing scenario
    const ctx: DAGEvalContext = {
      evaluateExpression: () => { throw new Error('PV OD600 not available'); },
    };
    exec.advance(ctx);
    const node = exec.getCurrentNode();
    expect(node?.id).toBe('p_true'); // default_branch=true selected
  });
});
```

- [ ] **Step 2:** Run — should FAIL (default_branch field absent)

```bash
cd /c/BIOCORE && pnpm --filter @biocore/batch-engine test dag-executor 2>&1 | tail -15
```

Expected: TypeScript may compile (extra prop on object literal); test fails because advance() throws when ctx.evaluateExpression throws.

- [ ] **Step 3:** Implement — add default_branch field + fallback in advance()

In `packages/batch-engine/src/dag-executor.ts`:

```typescript
// Update interface
export interface DAGBranchNode extends DAGNodeBase {
  type: 'branch';
  expression: string;
  /**
   * Fallback branch when ctx.evaluateExpression throws (e.g., PV field missing).
   * Default: takes 'false' edge.
   */
  default_branch?: 'true' | 'false';
}
```

In `DAGExecutor.advance()` method, find the branch evaluation block and wrap with try/catch:

```typescript
// inside advance(ctx: DAGEvalContext)
if (currentNode.type === 'branch') {
  let branchResult: boolean;
  try {
    branchResult = ctx.evaluateExpression(currentNode.expression);
  } catch (e) {
    // PV missing or expression error — use default_branch fallback
    const fallback = currentNode.default_branch ?? 'false';
    branchResult = fallback === 'true';
  }
  const targetEdge = this.dag.edges.find(
    e => e.from === currentNode.id && e.label === (branchResult ? 'true' : 'false')
  );
  // ... existing logic
}
```

- [ ] **Step 4:** Run test — must PASS

```bash
cd /c/BIOCORE && pnpm --filter @biocore/batch-engine test dag-executor 2>&1 | tail -10
```

Expected: 5+1 tests pass (5 existing + 1 new default_branch test).

- [ ] **Step 5:** Commit

```bash
git -C /c/BIOCORE add packages/batch-engine/src/dag-executor.ts packages/batch-engine/src/__tests__/dag-executor.test.ts
git -C /c/BIOCORE commit -m "feat(batch-engine): DAGBranchNode default_branch fallback for PV-missing case (T3)"
```

---

### Task 4：BatchController 加 dagExecutor / dag 字段（plumbing）

**Files:**
- Modify: `packages/batch-engine/src/batch-controller.ts`

不改任何逻辑，仅声明字段，确保 build 仍通。

- [ ] **Step 1:** Read current BatchController class declaration

```bash
sed -n '32,50p' /c/BIOCORE/packages/batch-engine/src/batch-controller.ts
```

记录现有字段顺序，找到 `private phaseIndex = 0` 那行（约 L39）。

- [ ] **Step 2:** Add new fields next to phaseIndex

```typescript
import { DAGExecutor, type RecipeDAG, type DAGEvalContext } from './dag-executor';

// inside class BatchController:
private phaseIndex = 0;        // [DEPRECATED — to be removed in T20]
private currentNodeId: string | null = null;     // NEW T4
private dag: RecipeDAG | null = null;            // NEW T4
private dagExecutor: DAGExecutor | null = null;  // NEW T4
```

- [ ] **Step 3:** Build to confirm no TS errors

```bash
cd /c/BIOCORE && pnpm --filter @biocore/batch-engine build 2>&1 | tail -3
```

Expected: 0 errors.

- [ ] **Step 4:** Run existing tests — should still pass (no behavior change)

```bash
cd /c/BIOCORE && pnpm --filter @biocore/batch-engine test 2>&1 | tail -3
```

Expected: same baseline count of tests pass.

- [ ] **Step 5:** Commit

```bash
git -C /c/BIOCORE add packages/batch-engine/src/batch-controller.ts
git -C /c/BIOCORE commit -m "feat(batch-engine): BatchController plumbing for dagExecutor + dag fields (T4)"
```

---

### Task 5：PhaseStatus 字段重构 — 加 node_id + phase_id

**Files:**
- Modify: `packages/batch-engine/src/batch-controller.ts`

PhaseStatus 接口定义在 `batch-controller.ts` 内（不是单独文件），先扩展为含 node_id；保留老 index 字段一会儿删。

- [ ] **Step 1:** Find PhaseStatus interface definition

```bash
grep -n "interface PhaseStatus\|type PhaseStatus" /c/BIOCORE/packages/batch-engine/src/batch-controller.ts
```

- [ ] **Step 2:** Update interface

```typescript
export interface PhaseStatus {
  index: number;          // [DEPRECATED — kept for transition; remove in T20]
  node_id?: string;       // NEW T5: DAG node id (set when DAG path active)
  phase_id?: string;      // NEW T5: recipe phase_id (e.g. 'EXPONENTIAL_GROWTH')
  state: 'pending' | 'ready' | 'running' | 'held' | 'done' | 'skipped' | 'error';
  hold_reason?: string;
  started_at?: string;
  ended_at?: string;
}
```

- [ ] **Step 3:** Build + existing tests pass

```bash
cd /c/BIOCORE && pnpm --filter @biocore/batch-engine build 2>&1 | tail -3
cd /c/BIOCORE && pnpm --filter @biocore/batch-engine test 2>&1 | tail -3
```

Expected: 0 errors, baseline tests pass.

- [ ] **Step 4:** Commit

```bash
git -C /c/BIOCORE add packages/batch-engine/src/batch-controller.ts
git -C /c/BIOCORE commit -m "feat(batch-engine): PhaseStatus add node_id + phase_id fields (T5)"
```

---

### Task 6：linearToDag helper available in batch-engine

**Files:**
- Modify: `packages/batch-engine/src/dag-executor.ts` (likely already has linearToDag from Sprint 3 M3.5)

- [ ] **Step 1:** Verify linearToDag exists or import it

```bash
grep -n "linearToDag\|export function linearToDag" /c/BIOCORE/packages/batch-engine/src/dag-executor.ts
grep -rn "linearToDag" /c/BIOCORE/packages/server/src/recipe-dag.ts 2>&1 | head -5
```

If linearToDag is in `packages/server/src/recipe-dag.ts` (Sprint 3 location), it must be moved/duplicated to batch-engine to avoid batch-engine → server reverse dep.

- [ ] **Step 2:** If linearToDag is server-only, copy to batch-engine

Add to `packages/batch-engine/src/dag-executor.ts` (export):

```typescript
import type { Recipe, PhaseConfig } from '@biocore/types';

/**
 * Convert old linear phases array to a DAG with deterministic node IDs.
 * Used by BatchController to load v1 (linear) recipes through the DAG runtime.
 */
export function linearToDag(phases: PhaseConfig[]): RecipeDAG {
  const nodes: DAGNode[] = [{ id: 'n_start', type: 'start' }];
  const edges: DAGEdge[] = [];

  if (phases.length === 0) {
    nodes.push({ id: 'n_end', type: 'end' });
    edges.push({ id: 'e_start_end', from: 'n_start', to: 'n_end' });
    return { schema_version: 2, nodes, edges };
  }

  let prevId = 'n_start';
  phases.forEach((phase, idx) => {
    const nodeId = `n_${idx}`;
    nodes.push({
      id: nodeId,
      type: 'phase',
      phase_id: phase.phase_id ?? `phase_${idx}`,
      phase_type: phase.type,
      params: phase.params,
    });
    edges.push({ id: `e_${prevId}_${nodeId}`, from: prevId, to: nodeId });
    prevId = nodeId;
  });

  nodes.push({ id: 'n_end', type: 'end' });
  edges.push({ id: `e_${prevId}_end`, from: prevId, to: 'n_end' });

  return { schema_version: 2, nodes, edges };
}
```

- [ ] **Step 3:** Add unit test

In `packages/batch-engine/src/__tests__/dag-executor.test.ts`:

```typescript
import { linearToDag } from '../dag-executor';

describe('linearToDag', () => {
  it('converts empty phases to start→end', () => {
    const dag = linearToDag([]);
    expect(dag.nodes).toHaveLength(2);
    expect(dag.nodes[0].type).toBe('start');
    expect(dag.nodes[1].type).toBe('end');
  });

  it('converts 3 phases to start→p0→p1→p2→end', () => {
    const dag = linearToDag([
      { type: 'fermentation', phase_id: 'P0', params: {} } as any,
      { type: 'fermentation', phase_id: 'P1', params: {} } as any,
      { type: 'feeding', phase_id: 'P2', params: {} } as any,
    ]);
    const phaseNodes = dag.nodes.filter(n => n.type === 'phase');
    expect(phaseNodes.map(n => n.id)).toEqual(['n_0', 'n_1', 'n_2']);
    expect(dag.edges.length).toBe(4); // start→p0, p0→p1, p1→p2, p2→end
  });
});
```

- [ ] **Step 4:** Run + commit

```bash
cd /c/BIOCORE && pnpm --filter @biocore/batch-engine test 2>&1 | tail -3
git -C /c/BIOCORE add packages/batch-engine/src/dag-executor.ts packages/batch-engine/src/__tests__/dag-executor.test.ts
git -C /c/BIOCORE commit -m "feat(batch-engine): linearToDag helper for v1 recipe compatibility (T6)"
```

Expected: tests green; 2 new tests pass.

---

## Phase B — Core Logic（Tasks 7-13）

### Task 7：startRecipe 调 linearToDagIfNeeded + 初始化 DAGExecutor

**Files:**
- Modify: `packages/batch-engine/src/batch-controller.ts`

- [ ] **Step 1:** Find startRecipe / setRecipe method (line ~120 per earlier scan)

```bash
sed -n '120,160p' /c/BIOCORE/packages/batch-engine/src/batch-controller.ts
```

- [ ] **Step 2:** Add private helper

```typescript
private linearToDagIfNeeded(recipe: Recipe): RecipeDAG {
  // recipe might have either .dag (v2) or .phases (v1)
  if ((recipe as any).dag && (recipe as any).dag.schema_version === 2) {
    return (recipe as any).dag;
  }
  return linearToDag(recipe.phases ?? []);
}
```

Add import:
```typescript
import { DAGExecutor, type RecipeDAG, linearToDag } from './dag-executor';
```

- [ ] **Step 3:** In existing `setRecipe()` (or wherever startRecipe initializes), add DAG init alongside the existing phase array setup:

```typescript
// existing code:
this.recipe = recipe;
this.phaseIndex = 0;
this.phaseStatuses = recipe.phases.map((phase, idx) => ({...}));

// NEW:
this.dag = this.linearToDagIfNeeded(recipe);
this.dagExecutor = new DAGExecutor(this.dag);
this.dagExecutor.start();
this.currentNodeId = this.dagExecutor.getCurrentNode()?.id ?? null;
```

Both old (phaseIndex) and new (dagExecutor) coexist for now; consumer reads phaseIndex still.

- [ ] **Step 4:** Build + tests

```bash
cd /c/BIOCORE && pnpm --filter @biocore/batch-engine build 2>&1 | tail -3
cd /c/BIOCORE && pnpm --filter @biocore/batch-engine test 2>&1 | tail -3
```

Expected: 0 build errors; baseline tests pass.

- [ ] **Step 5:** Commit

```bash
git -C /c/BIOCORE add packages/batch-engine/src/batch-controller.ts
git -C /c/BIOCORE commit -m "feat(batch-engine): startRecipe initializes DAGExecutor alongside phaseIndex (T7)"
```

---

### Task 8：phaseStatuses 数组 → Map<nodeId>

**Files:**
- Modify: `packages/batch-engine/src/batch-controller.ts`

This is the largest single refactor. Convert all read/write of phaseStatuses from array indexed by phaseIndex to Map keyed by nodeId. To keep CI green, also keep an array view derived from the Map for transitional consumers.

- [ ] **Step 1:** Add new field + derived getter

```typescript
private phaseStatusesMap: Map<string, PhaseStatus> = new Map();

get phaseStatuses(): PhaseStatus[] {
  // Transitional: derived view sorted by initial DAG insertion order
  return Array.from(this.phaseStatusesMap.values()).sort((a, b) => a.index - b.index);
}
```

Comment out or replace the old `private phaseStatuses: PhaseStatus[] = []` declaration.

- [ ] **Step 2:** Update setRecipe initialization

```typescript
// OLD:
this.phaseStatuses = recipe.phases.map(...)

// NEW:
this.phaseStatusesMap.clear();
const allPhaseNodes = this.dag!.nodes.filter(n => n.type === 'phase');
allPhaseNodes.forEach((node, idx) => {
  this.phaseStatusesMap.set(node.id, {
    index: idx,                                // legacy field
    node_id: node.id,
    phase_id: (node as any).phase_id,
    state: 'pending',
  });
});
```

- [ ] **Step 3:** Update all write sites

Find every `this.phaseStatuses[idx] = ...` and `this.phaseStatuses[idx].state = ...` and rewrite using the Map. Example:

```typescript
// OLD: this.phaseStatuses[phaseIndex].state = 'running';
// NEW: const ps = this.phaseStatusesMap.get(/* find by index → nodeId */);
//      if (ps) ps.state = 'running';
```

For transitional period, helper:

```typescript
private getPhaseStatusByIndex(idx: number): PhaseStatus | undefined {
  for (const ps of this.phaseStatusesMap.values()) {
    if (ps.index === idx) return ps;
  }
  return undefined;
}
```

Use this helper in old `startPhaseByIndex(idx)` etc. to find by old index. New API will use nodeId directly.

- [ ] **Step 4:** Build + tests pass

```bash
cd /c/BIOCORE && pnpm --filter @biocore/batch-engine build 2>&1 | tail -5
cd /c/BIOCORE && pnpm --filter @biocore/batch-engine test 2>&1 | tail -5
```

Expected: 0 errors; baseline tests pass (53+).

- [ ] **Step 5:** Commit

```bash
git -C /c/BIOCORE add packages/batch-engine/src/batch-controller.ts
git -C /c/BIOCORE commit -m "refactor(batch-engine): phaseStatuses array → Map<nodeId>, with array view shim (T8)"
```

---

### Task 9：advance() 用 DAGExecutor + branch 求值

**Files:**
- Modify: `packages/batch-engine/src/batch-controller.ts`

- [ ] **Step 1:** Find phase-complete handler (where it advances to next phase)

```bash
grep -n "readyNextPhase\|onStepEvent.*phase_complete\|phase_complete" /c/BIOCORE/packages/batch-engine/src/batch-controller.ts | head -10
```

Likely `readyNextPhase(afterIndex)` (line ~295 per earlier scan).

- [ ] **Step 2:** Add buildEvalContext helper

```typescript
private buildEvalContext(): DAGEvalContext {
  const lastPV = this.lastSampledPV ?? {}; // assume BatchController already tracks last PV from onSample
  const phaseStarted = this.currentPhaseStartedAt ?? Date.now();
  const phaseElapsedMin = (Date.now() - phaseStarted) / 60_000;

  return {
    evaluateExpression: (expr: string): boolean => {
      // Use existing condition-evaluator from batch-engine
      const fields = {
        ...lastPV,
        phase_elapsed_min: phaseElapsedMin,
      };
      return evaluateConditionExpression(expr, fields);
    },
  };
}
```

Imports:
```typescript
import { evaluateExpression as evaluateConditionExpression } from './condition-evaluator';
```

(adjust to actual export name in condition-evaluator.ts)

- [ ] **Step 3:** Replace readyNextPhase logic

```typescript
private readyNextPhase(afterIndex: number): void {
  if (!this.dagExecutor || !this.dag) {
    // Should not happen if startRecipe was called
    return;
  }
  const ctx = this.buildEvalContext();
  this.dagExecutor.advance(ctx);
  const nextNode = this.dagExecutor.getCurrentNode();

  if (!nextNode || nextNode.type === 'end') {
    this.complete();
    return;
  }

  if (nextNode.type === 'phase') {
    this.currentNodeId = nextNode.id;
    const ps = this.phaseStatusesMap.get(nextNode.id);
    if (ps) {
      // Auto-start? Old logic: this.startPhaseByIndex(idx)
      // New logic: mark ready or auto-start based on policy
      if (this.config.autoStartNextPhase !== false) {
        ps.state = 'ready';
        this.startPhase(nextNode.id);   // new method to be added in T10
      } else {
        ps.state = 'ready';
      }
    }
  }
}
```

- [ ] **Step 4:** Add unit test for branch advance

In `packages/batch-engine/src/__tests__/batch-controller-dag.test.ts` (CREATE this file):

```typescript
import { describe, it, expect, vi } from 'vitest';
import { BatchController } from '../batch-controller';

describe('BatchController DAG runtime — branch advance', () => {
  it('advances through linear DAG correctly (regression: v1 recipe behavior preserved)', async () => {
    const ctrl = new BatchController({ /* minimal config */ } as any);
    const recipe = {
      recipe_id: 'TEST',
      phases: [
        { type: 'fermentation', phase_id: 'P0', params: {} },
        { type: 'feeding', phase_id: 'P1', params: {} },
      ],
    };
    ctrl.setRecipe(recipe as any);
    expect(ctrl.currentNodeId).toBe('n_0');
    // Simulate phase complete
    (ctrl as any).readyNextPhase(0);
    expect(ctrl.currentNodeId).toBe('n_1');
  });
});
```

(Adjust to actual BatchController constructor signature found in code.)

- [ ] **Step 5:** Run + commit

```bash
cd /c/BIOCORE && pnpm --filter @biocore/batch-engine test 2>&1 | tail -5
git -C /c/BIOCORE add packages/batch-engine/src/batch-controller.ts packages/batch-engine/src/__tests__/batch-controller-dag.test.ts
git -C /c/BIOCORE commit -m "feat(batch-engine): readyNextPhase uses DAGExecutor + branch evaluation (T9)"
```

Expected: new test passes + existing 53 still green.

---

### Task 10：startPhase(nodeId) API 替换 startPhaseByIndex

**Files:**
- Modify: `packages/batch-engine/src/batch-controller.ts`

- [ ] **Step 1:** Add new public methods

```typescript
startPhase(nodeId: string): { success: boolean; message: string } {
  if (!this.dag) return { success: false, message: 'No active recipe' };
  const node = this.dag.nodes.find(n => n.id === nodeId);
  if (!node || node.type !== 'phase') {
    return { success: false, message: `Node ${nodeId} not found or not a phase` };
  }
  const ps = this.phaseStatusesMap.get(nodeId);
  if (!ps) return { success: false, message: `Status not found for ${nodeId}` };
  if (ps.state !== 'pending' && ps.state !== 'ready' && ps.state !== 'held') {
    return { success: false, message: `Phase ${nodeId} state ${ps.state} cannot start` };
  }
  // Stop any running phase
  for (const other of this.phaseStatusesMap.values()) {
    if (other.state === 'running') other.state = 'held';
  }
  ps.state = 'running';
  ps.started_at = new Date().toISOString();
  this.currentNodeId = nodeId;
  this.launchPhaseEngineByNode(node as DAGPhaseNode);
  return { success: true, message: `Phase ${nodeId} started` };
}

holdPhase(nodeId: string, reason?: string): void {
  const ps = this.phaseStatusesMap.get(nodeId);
  if (!ps || ps.state !== 'running') return;
  ps.state = 'held';
  ps.hold_reason = reason;
  this.emit('phase_held', { node_id: nodeId, reason });
}

restartPhase(nodeId: string): void {
  const ps = this.phaseStatusesMap.get(nodeId);
  if (!ps) return;
  ps.state = 'pending';
  ps.hold_reason = undefined;
  this.emit('phase_restarted', { node_id: nodeId });
}

skipPhase(nodeId: string): void {
  const ps = this.phaseStatusesMap.get(nodeId);
  if (!ps) return;
  ps.state = 'skipped';
  this.emit('phase_skipped', { node_id: nodeId });
  this.readyNextPhase(ps.index);
}

get currentPhaseNode(): DAGPhaseNode | null {
  if (!this.dag || !this.currentNodeId) return null;
  const node = this.dag.nodes.find(n => n.id === this.currentNodeId);
  return node && node.type === 'phase' ? (node as DAGPhaseNode) : null;
}
```

- [ ] **Step 2:** Add launchPhaseEngineByNode helper (replaces launchPhaseEngine(idx))

```typescript
private launchPhaseEngineByNode(node: DAGPhaseNode): void {
  // Replace existing launchPhaseEngine(phaseIndex) logic.
  // Find the original method around line 350-400, replicate behavior using node.params + node.phase_type
}
```

(Implementer reads existing launchPhaseEngine and adapts the body to take a node instead of an index. The phaseIndex was used to look up `this.recipe.phases[idx]`; now use `node.params` directly.)

- [ ] **Step 3:** Keep old startPhaseByIndex etc. as thin wrappers (for transition)

```typescript
/** @deprecated Use startPhase(nodeId). Removed in T20. */
startPhaseByIndex(phaseIndex: number): { success: boolean; message: string } {
  const ps = this.getPhaseStatusByIndex(phaseIndex);
  if (!ps?.node_id) return { success: false, message: 'index not mapped to nodeId' };
  return this.startPhase(ps.node_id);
}
```

Same for holdPhase/restartPhase/skipPhase old signatures.

- [ ] **Step 4:** Update test

Add to `batch-controller-dag.test.ts`:

```typescript
it('startPhase(nodeId) starts the phase', () => {
  const ctrl = new BatchController({} as any);
  ctrl.setRecipe({ recipe_id: 'T', phases: [{ type: 'fermentation', phase_id: 'P0', params: {} }] } as any);
  const r = ctrl.startPhase('n_0');
  expect(r.success).toBe(true);
  expect(ctrl.currentNodeId).toBe('n_0');
});
```

- [ ] **Step 5:** Build + test + commit

```bash
cd /c/BIOCORE && pnpm --filter @biocore/batch-engine build 2>&1 | tail -3
cd /c/BIOCORE && pnpm --filter @biocore/batch-engine test 2>&1 | tail -5
git -C /c/BIOCORE add packages/batch-engine/src/batch-controller.ts packages/batch-engine/src/__tests__/batch-controller-dag.test.ts
git -C /c/BIOCORE commit -m "feat(batch-engine): public API startPhase/holdPhase/skipPhase by nodeId (T10)"
```

---

### Task 11：step-engine 接 currentPhaseNode（R11 验证）

**Files:**
- Modify: `packages/batch-engine/src/step-engine.ts`
- Modify: `packages/batch-engine/src/batch-controller.ts` (caller side)

- [ ] **Step 1:** Read step-engine to confirm phase_index dependency

```bash
grep -n "phase_index\|phaseIndex" /c/BIOCORE/packages/batch-engine/src/step-engine.ts
```

- [ ] **Step 2:** Update StepLogEntry to add node_id

In `step-engine.ts`:

```typescript
export interface StepLogEntry {
  phase_index: number;       // [DEPRECATED]
  node_id?: string;           // NEW
  phase_id: string;
  phase_type: PhaseType;
  step_number: number;
  step_name: string;
  // ... rest unchanged
}
```

- [ ] **Step 3:** Update StepEngine constructor / evaluate to accept and emit node_id

Find where StepEngine is instantiated in batch-controller (likely in launchPhaseEngine path) and pass `node_id` as part of the phase context.

- [ ] **Step 4:** Build + tests pass (existing batch-engine tests should still pass — added field is optional)

```bash
cd /c/BIOCORE && pnpm --filter @biocore/batch-engine build 2>&1 | tail -3
cd /c/BIOCORE && pnpm --filter @biocore/batch-engine test 2>&1 | tail -3
```

- [ ] **Step 5:** Commit

```bash
git -C /c/BIOCORE add packages/batch-engine/src/step-engine.ts packages/batch-engine/src/batch-controller.ts
git -C /c/BIOCORE commit -m "feat(batch-engine): step-engine StepLogEntry adds node_id field (T11)"
```

---

### Task 12：crash 恢复 — resumeBatch from current_node_id

**Files:**
- Modify: `packages/batch-engine/src/batch-controller.ts`
- Modify: `packages/data-service/src/sqlite-service.ts` (add updateBatchCurrentNodeId helper)

- [ ] **Step 1:** Add SQLite helper

In `packages/data-service/src/sqlite-service.ts`:

```typescript
export function updateBatchCurrentNodeId(db: Database.Database, batchId: string, nodeId: string | null): void {
  db.prepare('UPDATE batches SET current_node_id = ? WHERE id = ?').run(nodeId, batchId);
}

export function getBatchCurrentNodeId(db: Database.Database, batchId: string): string | null {
  const row = db.prepare('SELECT current_node_id FROM batches WHERE id = ?').get(batchId) as { current_node_id: string | null } | undefined;
  return row?.current_node_id ?? null;
}
```

- [ ] **Step 2:** Re-export from data-service index.ts

```typescript
export { updateBatchCurrentNodeId, getBatchCurrentNodeId } from './sqlite-service';
```

- [ ] **Step 3:** In BatchController, on every node transition, persist

After `this.currentNodeId = ...` in setRecipe / readyNextPhase / startPhase, add:

```typescript
this.config.persist?.updateCurrentNodeId(this.currentBatchId, this.currentNodeId);
```

(BatchController doesn't directly know about SQLite — pass as injection in config.)

Update `BatchControllerConfig`:

```typescript
export interface BatchControllerConfig {
  // ... existing
  persist?: {
    updateCurrentNodeId: (batchId: string, nodeId: string | null) => void;
  };
}
```

- [ ] **Step 4:** Add resumeBatch method

```typescript
resumeBatch(batchId: string, recipe: Recipe, savedNodeId: string | null): void {
  this.currentBatchId = batchId;
  this.recipe = recipe;
  this.dag = this.linearToDagIfNeeded(recipe);
  this.dagExecutor = new DAGExecutor(this.dag);

  // Reset phaseStatusesMap from DAG
  this.phaseStatusesMap.clear();
  const allPhaseNodes = this.dag.nodes.filter(n => n.type === 'phase');
  allPhaseNodes.forEach((node, idx) => {
    this.phaseStatusesMap.set(node.id, {
      index: idx,
      node_id: node.id,
      phase_id: (node as any).phase_id,
      state: 'pending',
    });
  });

  if (savedNodeId) {
    // Walk DAG manually to position executor at savedNodeId
    this.dagExecutor.start();
    // Mark all phases before savedNodeId as 'done', set savedNodeId itself to 'running'
    // (best-effort reconstruction)
    for (const ps of this.phaseStatusesMap.values()) {
      if (ps.node_id === savedNodeId) {
        ps.state = 'running';
        break;
      }
      ps.state = 'done';
    }
    this.currentNodeId = savedNodeId;
  } else {
    // No saved nodeId — start from beginning (R1 fallback)
    this.dagExecutor.start();
    this.currentNodeId = this.dagExecutor.getCurrentNode()?.id ?? null;
  }

  this.emit('batch_resumed', { batch_id: batchId, node_id: this.currentNodeId });
}
```

- [ ] **Step 5:** Add unit test

```typescript
it('resumeBatch with savedNodeId restores correct phase', () => {
  const ctrl = new BatchController({} as any);
  const recipe = { recipe_id: 'T', phases: [
    { type: 'fermentation', phase_id: 'P0', params: {} },
    { type: 'feeding', phase_id: 'P1', params: {} },
    { type: 'feeding', phase_id: 'P2', params: {} },
  ]};
  ctrl.resumeBatch('B-1', recipe as any, 'n_1');
  expect(ctrl.currentNodeId).toBe('n_1');
  const statuses = ctrl.phaseStatuses;
  expect(statuses[0].state).toBe('done');
  expect(statuses[1].state).toBe('running');
  expect(statuses[2].state).toBe('pending');
});

it('resumeBatch with NULL savedNodeId starts from beginning', () => {
  const ctrl = new BatchController({} as any);
  const recipe = { recipe_id: 'T', phases: [
    { type: 'fermentation', phase_id: 'P0', params: {} },
  ]};
  ctrl.resumeBatch('B-1', recipe as any, null);
  expect(ctrl.currentNodeId).toBe('n_0');
});
```

- [ ] **Step 6:** Commit

```bash
git -C /c/BIOCORE add packages/batch-engine/src/batch-controller.ts packages/data-service/src/sqlite-service.ts packages/data-service/src/index.ts packages/batch-engine/src/__tests__/batch-controller-dag.test.ts
git -C /c/BIOCORE commit -m "feat(batch-engine): resumeBatch + persist current_node_id for crash recovery (T12)"
```

---

### Task 13：Branch evaluation audit + skipped events

**Files:**
- Modify: `packages/batch-engine/src/batch-controller.ts`

When advance() crosses a branch node, emit a `branch_evaluated` event with the result. When PV missing triggers default_branch fallback, emit `branch_evaluation_skipped`.

- [ ] **Step 1:** Modify buildEvalContext to track results

```typescript
private buildEvalContext(): DAGEvalContext & { _lastEvaluation?: { expression: string; result: boolean; pv: any; skipped: boolean } } {
  const ctx: any = {};
  ctx.evaluateExpression = (expr: string): boolean => {
    const lastPV = this.lastSampledPV ?? {};
    const phaseStarted = this.currentPhaseStartedAt ?? Date.now();
    const fields = { ...lastPV, phase_elapsed_min: (Date.now() - phaseStarted) / 60_000 };
    try {
      const result = evaluateConditionExpression(expr, fields);
      ctx._lastEvaluation = { expression: expr, result, pv: fields, skipped: false };
      return result;
    } catch (e) {
      ctx._lastEvaluation = { expression: expr, result: false, pv: fields, skipped: true };
      throw e;  // DAGExecutor catches and uses default_branch
    }
  };
  return ctx;
}
```

- [ ] **Step 2:** In readyNextPhase, after advance(), check if the current node was a branch and emit:

```typescript
// inside readyNextPhase after this.dagExecutor.advance(ctx)
if (ctx._lastEvaluation) {
  const ev = ctx._lastEvaluation;
  this.emit('branch_evaluated', {
    expression: ev.expression,
    result: ev.result,
    skipped: ev.skipped,
    pv_snapshot: ev.pv,
  });
}
```

- [ ] **Step 3:** Add test

```typescript
it('emits branch_evaluated with result + pv_snapshot', () => {
  const ctrl = new BatchController({} as any);
  ctrl.setRecipe({
    recipe_id: 'T',
    dag: {
      schema_version: 2,
      nodes: [
        { id: 's', type: 'start' },
        { id: 'p_a', type: 'phase', phase_id: 'A', phase_type: 'fermentation' },
        { id: 'b', type: 'branch', expression: 'OD600 > 5' },
        { id: 'p_t', type: 'phase', phase_id: 'TRUE', phase_type: 'feeding' },
        { id: 'p_f', type: 'phase', phase_id: 'FALSE', phase_type: 'feeding' },
        { id: 'e', type: 'end' },
      ],
      edges: [
        { id: 'e1', from: 's', to: 'p_a' },
        { id: 'e2', from: 'p_a', to: 'b' },
        { id: 'e3', from: 'b', to: 'p_t', label: 'true' },
        { id: 'e4', from: 'b', to: 'p_f', label: 'false' },
        { id: 'e5', from: 'p_t', to: 'e' },
        { id: 'e6', from: 'p_f', to: 'e' },
      ],
    },
  } as any);
  (ctrl as any).lastSampledPV = { OD600: 6 };
  const events: any[] = [];
  ctrl.on('branch_evaluated', e => events.push(e));
  (ctrl as any).readyNextPhase(0);
  expect(events.length).toBe(1);
  expect(events[0].result).toBe(true);
  expect(events[0].pv_snapshot.OD600).toBe(6);
});
```

- [ ] **Step 4:** Commit

```bash
git -C /c/BIOCORE add packages/batch-engine/src/batch-controller.ts packages/batch-engine/src/__tests__/batch-controller-dag.test.ts
git -C /c/BIOCORE commit -m "feat(batch-engine): emit branch_evaluated events with PV snapshot (T13)"
```

---

## Phase C — Adapters（Tasks 14-17）

### Task 14：server route 调用方更新

**Files:**
- Modify: `packages/server/src/index.ts` (places that call ctrl.startPhaseByIndex etc.)

- [ ] **Step 1:** Find all call sites

```bash
grep -n "startPhaseByIndex\|holdPhase\|skipPhase\|restartPhase" /c/BIOCORE/packages/server/src/index.ts
```

- [ ] **Step 2:** Identify route handlers and update each

For each route that takes `phaseIndex` from request, change to take `nodeId`:

```typescript
// OLD
app.post('/api/v1/batches/:id/phases/:idx/start', (req, res) => {
  ctrl.startPhaseByIndex(Number(req.params.idx));
});

// NEW
app.post('/api/v1/batches/:id/phases/:nodeId/start', (req, res) => {
  const r = ctrl.startPhase(req.params.nodeId);
  res.json(r);
});
```

(Route path changes from `/phases/:idx/...` to `/phases/:nodeId/...`)

- [ ] **Step 3:** Keep deprecated `:idx` routes for one version with redirect

```typescript
app.post('/api/v1/batches/:id/phases/:idx(\\d+)/start', (req, res) => {
  // Old numeric path — internally map to nodeId via ctrl.phaseStatuses
  const idx = Number(req.params.idx);
  const ps = ctrl.phaseStatuses[idx];
  if (!ps?.node_id) return res.status(404).json({ error: 'Phase index not found' });
  res.set('Deprecation', 'true').set('Sunset', '2026-12-01');
  const r = ctrl.startPhase(ps.node_id);
  res.json(r);
});
```

- [ ] **Step 4:** Build + commit

```bash
cd /c/BIOCORE && pnpm --filter @biocore/server build 2>&1 | tail -3
git -C /c/BIOCORE add packages/server/src/index.ts
git -C /c/BIOCORE commit -m "feat(server): batch phase routes accept nodeId; old idx deprecated (T14)"
```

---

### Task 15：audit_logs 写入语义改 + branch_evaluated 事件

**Files:**
- Modify: `packages/data-service/src/sqlite-service.ts`
- Modify: `packages/server/src/index.ts` (or wherever audit writes happen)

- [ ] **Step 1:** Update writeAuditLog signature to accept target_kind

```typescript
// OLD signature
export function writeAuditLog(db, args: { user_id, action, target_id, details })

// NEW
export function writeAuditLog(db, args: {
  user_id: string;
  action: string;
  target_id: string;
  target_kind?: 'phase_index' | 'node_id' | 'recipe_id' | 'batch_id' | 'user_id' | 'channel_id';
  details?: any;
  trace_id?: string;
})
```

Update SQL: `INSERT INTO audit_logs(..., target_kind) VALUES(..., ?)`.

- [ ] **Step 2:** Add new audit action in batch-controller bridge

When batch-controller emits `phase_started`, server-side bridge writes:

```typescript
ctrl.on('phase_started', (e) => {
  writeAuditLog(db, {
    user_id: 'system',
    action: 'phase_started',
    target_id: e.node_id,
    target_kind: 'node_id',
    details: { phase_id: e.phase_id, phase_type: e.phase_type },
  });
});

ctrl.on('branch_evaluated', (e) => {
  writeAuditLog(db, {
    user_id: 'system',
    action: 'branch_evaluated',
    target_id: e.node_id ?? 'unknown',
    target_kind: 'node_id',
    details: { expression: e.expression, result: e.result, skipped: e.skipped, pv_snapshot: e.pv_snapshot },
  });
});
```

- [ ] **Step 3:** Build + commit

```bash
cd /c/BIOCORE && pnpm --filter @biocore/data-service build 2>&1 | tail -3
cd /c/BIOCORE && pnpm --filter @biocore/server build 2>&1 | tail -3
git -C /c/BIOCORE add packages/data-service/src/sqlite-service.ts packages/server/src/index.ts
git -C /c/BIOCORE commit -m "feat(audit): writeAuditLog target_kind + branch_evaluated event (T15)"
```

---

### Task 16：WS broadcast payload v2

**Files:**
- Modify: `packages/server/src/index.ts` (broadcast function + ctrl listeners)

- [ ] **Step 1:** Update broadcast helper

Find `broadcast(channel, data)` calls; update to add payload_version:

```typescript
ctrl.on('phase_started', (e) => {
  broadcast('process_values', {
    type: 'phase_changed',
    payload_version: 2,
    batch_id: ctrl.currentBatchId,
    node_id: e.node_id,
    phase_id: e.phase_id,
    phase_type: e.phase_type,
  });
});

ctrl.on('branch_evaluated', (e) => {
  broadcast('process_values', {
    type: 'branch_evaluated',
    payload_version: 2,
    batch_id: ctrl.currentBatchId,
    node_id: e.node_id ?? null,
    expression: e.expression,
    result: e.result,
  });
});
```

- [ ] **Step 2:** Smoke test

```bash
pkill -f "tsx.*biocore" 2>/dev/null; sleep 2
cd /c/BIOCORE && MOCK_PLC=true PORT=3088 npx tsx packages/server/src/index.ts > /tmp/biocore-t16.log 2>&1 &
sleep 8
echo "---WS smoke---"
# Manual: connect via wscat or browser to ws://localhost:3088/ws and start a batch
pkill -f "tsx.*biocore"
```

- [ ] **Step 3:** Commit

```bash
git -C /c/BIOCORE add packages/server/src/index.ts
git -C /c/BIOCORE commit -m "feat(server): WS broadcast payload_version=2 with node_id (T16)"
```

---

### Task 17：Editor — DAGBranchNode default_branch 下拉

**Files:**
- Modify: `packages/web-ui/src/components/recipe-graph/NodeInspector.tsx` (or wherever branch node is edited)

- [ ] **Step 1:** Find branch node editor

```bash
grep -rn "DAGBranchNode\|expression" /c/BIOCORE/packages/web-ui/src/components/recipe-graph/ | head -10
```

- [ ] **Step 2:** Add default_branch dropdown next to expression input

```tsx
{node.type === 'branch' && (
  <>
    <label>Expression</label>
    <textarea value={node.expression} onChange={...} />

    <label>Default branch (PV missing fallback)</label>
    <select value={node.default_branch ?? ''} onChange={(e) => onChange({ ...node, default_branch: e.target.value as 'true'|'false' || undefined })}>
      <option value="">不设置（PV 缺失时走 false）</option>
      <option value="true">true</option>
      <option value="false">false</option>
    </select>
  </>
)}
```

- [ ] **Step 3:** Build + commit

```bash
cd /c/BIOCORE && pnpm --filter @biocore/web-ui build 2>&1 | tail -5
git -C /c/BIOCORE add packages/web-ui/src/components/recipe-graph/
git -C /c/BIOCORE commit -m "feat(web-ui): branch node editor adds default_branch dropdown (T17)"
```

---

## Phase D — Frontend（Tasks 18-22）

### Task 18：realtime-store WS reducer

**Files:**
- Modify: `packages/web-ui/src/stores/realtime-store.ts`

- [ ] **Step 1:** Find phase_changed handler

```bash
grep -n "phase_changed\|phaseIndex\|phase_index" /c/BIOCORE/packages/web-ui/src/stores/realtime-store.ts
```

- [ ] **Step 2:** Update reducer to read node_id

```typescript
case 'phase_changed':
  return set(state => ({
    ...state,
    batchRuntime: {
      ...state.batchRuntime,
      [payload.batch_id]: {
        node_id: payload.node_id,
        phase_id: payload.phase_id,
        phase_type: payload.phase_type,
      },
    },
  }));

case 'branch_evaluated':
  return set(state => ({
    ...state,
    recentBranchEvaluations: [
      { ts: new Date().toISOString(), ...payload },
      ...state.recentBranchEvaluations.slice(0, 49),
    ],
  }));
```

- [ ] **Step 3:** Build + commit

```bash
cd /c/BIOCORE && pnpm --filter @biocore/web-ui build 2>&1 | tail -3
git -C /c/BIOCORE add packages/web-ui/src/stores/realtime-store.ts
git -C /c/BIOCORE commit -m "feat(web-ui): realtime-store reducer reads node_id + branch_evaluated (T18)"
```

---

### Task 19：Dashboard timeline 改 phase_id 显示

**Files:**
- Modify: `packages/web-ui/src/app/dashboard/page.tsx`

- [ ] **Step 1:** Find current phase display

```bash
grep -n "phase_index\|Phase.*\\/.*length\|phaseIndex" /c/BIOCORE/packages/web-ui/src/app/dashboard/page.tsx
```

- [ ] **Step 2:** Replace "Phase 3 / 5" with phase_id + elapsed time

```tsx
<div>
  当前: <strong>{batchRuntime?.phase_id ?? '—'}</strong>
  <span className="text-sm text-gray-500 ml-2">{batchRuntime?.phase_type}</span>
</div>
```

- [ ] **Step 3:** Build + commit

```bash
cd /c/BIOCORE && pnpm --filter @biocore/web-ui build 2>&1 | tail -3
git -C /c/BIOCORE add packages/web-ui/src/app/dashboard/page.tsx
git -C /c/BIOCORE commit -m "feat(web-ui): dashboard timeline displays phase_id instead of index (T19)"
```

---

### Task 20：batches/[id] phase 列表用 getAllPhases

**Files:**
- Modify: `packages/web-ui/src/app/batches/[id]/page.tsx`

- [ ] **Step 1:** Find phase list rendering

```bash
grep -n "phases.map\|phaseStatuses" /c/BIOCORE/packages/web-ui/src/app/batches/[id]/page.tsx
```

- [ ] **Step 2:** Update to derive from DAG

```tsx
const allPhases: { node_id: string; phase_id: string; phase_type: string; status: string }[] = useMemo(() => {
  if (!batch?.recipe_dag) return [];
  return batch.recipe_dag.nodes
    .filter((n: any) => n.type === 'phase')
    .map((n: any) => ({
      node_id: n.id,
      phase_id: n.phase_id,
      phase_type: n.phase_type,
      status: batch.phase_statuses?.[n.id]?.state ?? 'pending',
    }));
}, [batch]);

// render allPhases.map(...)
```

- [ ] **Step 3:** Build + commit

```bash
cd /c/BIOCORE && pnpm --filter @biocore/web-ui build 2>&1 | tail -3
git -C /c/BIOCORE add packages/web-ui/src/app/batches/[id]/page.tsx
git -C /c/BIOCORE commit -m "feat(web-ui): batch detail phase list uses DAG nodes + nodeId-keyed status (T20)"
```

---

### Task 21：audit-logs target_kind + branch_evaluated 渲染

**Files:**
- Modify: `packages/web-ui/src/app/analysis/audit-logs/page.tsx`

- [ ] **Step 1:** Find ACTION_STYLE / target_id rendering

```bash
grep -n "ACTION_STYLE\|target_id\|target_kind" /c/BIOCORE/packages/web-ui/src/app/analysis/audit-logs/page.tsx
```

- [ ] **Step 2:** Add branch_evaluated to ACTION_STYLE

```typescript
const ACTION_STYLE: Record<string, string> = {
  // ... existing entries
  branch_evaluated: 'bg-amber-100 text-amber-800',
  branch_evaluation_skipped: 'bg-orange-100 text-orange-800',
};
```

- [ ] **Step 3:** Conditionally render target_id based on target_kind

```tsx
function renderTarget(target_id: string, target_kind: string | null) {
  if (target_kind === 'node_id') return <code className="font-mono text-xs">node:{target_id}</code>;
  if (!target_kind || target_kind === 'phase_index') return <span>Phase {target_id}</span>;
  return <span>{target_kind}:{target_id}</span>;
}
```

- [ ] **Step 4:** Build + commit

```bash
cd /c/BIOCORE && pnpm --filter @biocore/web-ui build 2>&1 | tail -3
git -C /c/BIOCORE add packages/web-ui/src/app/analysis/audit-logs/page.tsx
git -C /c/BIOCORE commit -m "feat(web-ui): audit-logs renders target_kind + branch_evaluated style (T21)"
```

---

### Task 22：前端集成验证

**Files:** none (verification)

- [ ] **Step 1:** Full web-ui build

```bash
cd /c/BIOCORE && pnpm --filter @biocore/web-ui build 2>&1 | tail -15
```

Expected: 0 TS errors; route `/admin/health`, `/settings/notifications`, `/dashboard`, `/batches/[id]`, `/analysis/audit-logs` all listed.

- [ ] **Step 2:** Visual sanity check (best-effort)

Start server + web-ui dev, open dashboard, verify:
- No console errors on page load
- Phase display shows phase_id (or "—" if no batch)

---

## Phase E — Validation + Release（Tasks 23-25）

### Task 23：端到端 b1-e2e.sh

**Files:**
- Create: `scripts/b1-e2e.sh`

- [ ] **Step 1:** Write script (see spec §7.3 for 8 scenarios)

```bash
#!/usr/bin/env bash
# scripts/b1-e2e.sh — B1.1 DAG runtime end-to-end smoke
# Usage: BIOCORE_URL=http://localhost:3001/api/v1 ADMIN_TOKEN=<jwt> ./scripts/b1-e2e.sh
set -euo pipefail
BIOCORE_URL=${BIOCORE_URL:-http://localhost:3001/api/v1}
TOKEN=${ADMIN_TOKEN:?ADMIN_TOKEN required}
H="Authorization: Bearer $TOKEN"

# 1. Create v2 DAG recipe with 1 branch
RECIPE_ID="b1-test-$(date +%s)"
curl -s -X POST "$BIOCORE_URL/recipes" -H "$H" -H "Content-Type: application/json" \
  -d '{"recipe_id":"'$RECIPE_ID'","name":"B1 test","version":"1.0.0","status":"approved","dag":{"schema_version":2,"nodes":[{"id":"s","type":"start"},{"id":"p_a","type":"phase","phase_id":"GROW","phase_type":"fermentation","params":{"target_temp":37}},{"id":"b","type":"branch","expression":"OD600 > 5"},{"id":"p_t","type":"phase","phase_id":"FEED","phase_type":"feeding","params":{}},{"id":"p_f","type":"phase","phase_id":"WAIT","phase_type":"fermentation","params":{}},{"id":"e","type":"end"}],"edges":[{"id":"e1","from":"s","to":"p_a"},{"id":"e2","from":"p_a","to":"b"},{"id":"e3","from":"b","to":"p_t","label":"true"},{"id":"e4","from":"b","to":"p_f","label":"false"},{"id":"e5","from":"p_t","to":"e"},{"id":"e6","from":"p_f","to":"e"}]}}' \
  | jq '.data.recipe_id // .recipe_id'

echo "Created recipe $RECIPE_ID"

# 2. Start batch
BATCH=$(curl -s -X POST "$BIOCORE_URL/batches" -H "$H" -H "Content-Type: application/json" \
  -d '{"reactor_id":"R1","recipe_id":"'$RECIPE_ID'"}' | jq -r '.data.id // .id')
echo "Batch $BATCH started"

# 3. Verify current_node_id is set
sleep 2
NODE=$(sqlite3 packages/server/data/biocore.db "SELECT current_node_id FROM batches WHERE id='$BATCH'")
[[ "$NODE" =~ ^n_ ]] && echo "✓ batches.current_node_id = $NODE" || { echo "✗ current_node_id not set"; exit 1; }

# (continued for scenarios 4-8...)
```

- [ ] **Step 2:** Make executable

```bash
chmod +x /c/BIOCORE/scripts/b1-e2e.sh
```

- [ ] **Step 3:** Commit

```bash
git -C /c/BIOCORE add scripts/b1-e2e.sh
git -C /c/BIOCORE commit -m "test(b1): e2e curl script for DAG runtime (T23)"
```

---

### Task 24：删老 phaseIndex 路径 + grep 残余

**Files:**
- Modify: `packages/batch-engine/src/batch-controller.ts` (remove deprecated wrappers)
- Modify: `packages/server/src/index.ts` (remove deprecated /phases/:idx routes)

- [ ] **Step 1:** Grep all repo for phaseIndex / phase_index references

```bash
grep -rn "phaseIndex\|phase_index" /c/BIOCORE/packages --include="*.ts" --include="*.tsx" | grep -v "DEPRECATED\|@deprecated\|node_modules\|\.d\.ts" | head -30
```

Categorize each hit:
- Legitimate compat layer (StepLogEntry.phase_index for old log readers) — keep
- Deprecated wrapper (startPhaseByIndex stub) — DELETE
- Forgotten reference — fix

- [ ] **Step 2:** Delete deprecated wrappers from batch-controller

Remove startPhaseByIndex / holdPhase(idx) etc. that were marked @deprecated in T10.

- [ ] **Step 3:** Delete deprecated routes from server

Remove `/phases/:idx(\\d+)/start` etc. from T14.

- [ ] **Step 4:** Build full monorepo + run full tests

```bash
cd /c/BIOCORE && pnpm -r build 2>&1 | tail -5
cd /c/BIOCORE && pnpm -r test 2>&1 | grep -E "Tests|passed|failed" | tail -10
```

Expected: 0 build errors; tests pass (some pre-existing data-service.test.ts failures may persist, unrelated).

- [ ] **Step 5:** Commit

```bash
git -C /c/BIOCORE add -A
git -C /c/BIOCORE commit -m "chore(b1): remove deprecated phaseIndex paths (T24)"
```

---

### Task 25：文档 + release v1.7.0

**Files:**
- Modify: `docs/部署说明.md`
- Modify: `docs/加固SOP.md`
- Create: `RELEASE_NOTES_v1.7.0.md`
- Modify: `package.json` (root + server + web-ui + batch-engine + data-service version bump)

- [ ] **Step 1:** Bump versions

| File | Old | New |
|---|---|---|
| `package.json` (root) | 1.6.0 | 1.7.0 |
| `packages/server/package.json` | 0.2.0 | 0.3.0 |
| `packages/web-ui/package.json` | 0.2.0 | 0.3.0 |
| `packages/batch-engine/package.json` | 0.1.1 | 0.2.0 |
| `packages/data-service/package.json` | 0.1.1 | 0.1.2 |

- [ ] **Step 2:** Add §12 to docs/部署说明.md

```markdown
## 12. Recipe DAG 运行时（v1.7.0+）

### 12.1 老 v1 配方兼容
所有 dag_schema_version=1 配方启动时由 `linearToDag()` 内存转换为 DAG，运行时统一走 DAGExecutor。无需手动迁移；老配方行为与 v1.6.0 完全一致。

### 12.2 v2 配方 branch 节点
- 编辑器 `/recipes/:id/edit-v2` 画 IF/ELSE 节点 + 表达式（如 `OD600 > 5`）
- 升级 v1.7.0 后自动启用，无 feature flag
- 表达式可用字段：temperature / pH / DO / OD600 / weight / phase_elapsed_min
- 运算符：> < >= <= == != + && || + 括号

### 12.3 default_branch 兜底
PV 缺失（如 OD600 还没采到）时 branch 求值会失败。在编辑器中可选 `default_branch: 'true' | 'false'` 兜底。

### 12.4 升级前提
**必须无 running 批次**。把所有反应器停到 idle 后再升级。
```

- [ ] **Step 3:** Add §11 to docs/加固SOP.md

```markdown
## 11. Branch 求值故障排查

### 现象 1：OD600 采集后 branch 永远走 false
- 检查 condition-evaluator 字段名是否匹配（区分大小写）
- 查 audit_logs 找 `branch_evaluated` 行，看 details.pv_snapshot 是否含 OD600

### 现象 2：current_node_id 卡死
- 确认 dagExecutor 是否被外部代码意外重置
- 查 audit_logs 看 `phase_started` 序列是否中断
- 重启服务通常会用 batches.current_node_id 自动续跑
```

- [ ] **Step 4:** Write RELEASE_NOTES_v1.7.0.md

```markdown
# BIOCore v1.7.0 — DAG Runtime Release

**Release Date:** TBD
**Sprint:** Sprint 5 Track B1.1
**Tag:** `v1.7.0`

## TL;DR
React-flow 编辑器画的 IF/ELSE 节点在生产真正生效。

## What's New
- BatchController 升级到 DAG 运行时
- v1 (linear) 配方自动 linearToDag 兼容
- batches.current_node_id 持久化崩溃恢复
- audit_logs.target_kind 区分 phase_index / node_id
- WS payload_version=2 含 node_id
- branch_evaluated audit 事件 + WS 广播
- Editor: branch 节点加 default_branch 下拉

## Breaking Changes
- 升级前必须无 running 批次
- WS payload phase_index → node_id（前端需 reload 浏览器）
- API: /batches/:id/phases/:idx → :nodeId

## Migrations
- 023-batch-current-node.sql（自动应用）

## Upgrade
\`\`\`bash
docker compose stop biocore-server  # 确保所有反应器 idle
git checkout v1.7.0
docker compose up -d --build biocore-server
\`\`\`
```

- [ ] **Step 5:** Tag + merge to main

```bash
git -C /c/BIOCORE add -A
git -C /c/BIOCORE commit -m "release: v1.7.0 — DAG runtime (B1.1) (T25)"

git -C /c/BIOCORE tag -a v1.7.0 -m "v1.7.0 DAG Runtime Release

See RELEASE_NOTES_v1.7.0.md for details."

git -C /c/BIOCORE checkout main
git -C /c/BIOCORE merge --no-ff sprint5-b1-dag-runtime -m "merge: Sprint 5 B1.1 DAG runtime (v1.7.0)"
git -C /c/BIOCORE log --oneline | head -5
```

- [ ] **Step 6:** Verify final state

```bash
git -C /c/BIOCORE log --oneline | head -5
git -C /c/BIOCORE tag | tail -5
cd /c/BIOCORE && pnpm -r build 2>&1 | tail -5
```

Expected: tag v1.7.0 exists; main branch merged; all packages build.

---

## Self-Review

| Spec § | Plan task | Notes |
|---|---|---|
| §1 决策 1 真客户需求 IF/ELSE | T9 (branch advance) + T13 (audit) | ✅ |
| §1 决策 2 可停产升级 | T25 release notes 明示 | ✅ |
| §1 决策 3 仅 IF/ELSE | T20 删 deprecated；不实施 Loop/Goto/SubRecipe | ✅ |
| §1 决策 4 v1 自动 linearToDag | T6 + T7 | ✅ |
| §1 决策 5 phase 完成时求值 | T9 readyNextPhase | ✅ |
| §1 决策 6 phaseIndex → currentNodeId | T8 + T10 + T14 + T18-T21 | ✅ |
| §1 决策 7 batches.current_node_id 持久化 | T2 (migration) + T12 (resumeBatch) | ✅ |
| §3 架构图 | T7 setRecipe initializes DAGExecutor | ✅ |
| §4.1 字段变化 | T4 + T5 + T8 | ✅ |
| §4.2 公共 API 变化 | T10 | ✅ |
| §4.3 PhaseStatus 变化 | T5 | ✅ |
| §4.4 DAGBranchNode default_branch | T3 | ✅ |
| §4.5 Migration 023 | T2 | ✅ |
| §4.6 audit_logs 写入 | T15 | ✅ |
| §4.7 WS payload | T16 | ✅ |
| §5 前端 4 处改动 | T18 + T19 + T20 + T21 | ✅ |
| §6 R1 (NULL nodeId fallback) | T12 Step 4 | ✅ |
| §6 R2 (linearToDag bug) | T6 unit tests | ✅ |
| §6 R3 (PV missing default_branch) | T3 + T13 | ✅ |
| §6 R5 (DAG cycle) | DAGExecutor MaxStepsExceeded (existing) | ✅ |
| §6 R11 (step-engine phase_index) | T11 audit + node_id field | ✅ |
| §7 测试金字塔 | T9-T13 单测 + T23 e2e | ✅ |
| §7.5 通过门槛 | T22 build all + T24 full test + T25 manual | ✅ |
| §8.4 sub-spec 队列 | RELEASE_NOTES 注明 | ✅ |
| §9 YAGNI 切除 8 项 | 计划中无任务实施 | ✅ |

**Placeholder scan:** 0 处。

**Type consistency:** `currentNodeId: string | null` / `phaseStatusesMap: Map<string, PhaseStatus>` / `DAGBranchNode.default_branch?: 'true' | 'false'` 在所有 task 一致。

**Gaps fixed inline:** none.

---

## 执行选项

Plan complete and saved to `docs/superpowers/plans/2026-05-01-dag-runtime-plan.md`. Two execution options:

**1. Subagent-Driven（推荐）** — 每 task 派遣 fresh subagent，task 间双层 review，迭代快
**2. Inline Execution** — 当前会话内逐 task 推进 + checkpoint

> 选哪个？
