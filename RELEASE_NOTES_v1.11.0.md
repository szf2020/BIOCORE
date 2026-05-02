# BIOCore v1.11.0 — B1.3 Goto Nodes

**Release Date:** 2026-05-01
**Type:** Minor — new DAG node type, behavior preserving for existing recipes
**Tag:** `v1.11.0`

## TL;DR
B1.3 ships **Goto pass-through nodes** — a single-out-edge routing node usable for fault-recovery jumps and back-edges. Back-edges are gated behind `recipe.dag.options.maxRevisits > 1`; default `maxRevisits=1` keeps existing acyclic-only behavior unchanged. First new DAG node type since v1.7.0's IF/ELSE.

## What's new

### Schema additions

`DAGNodeType` now includes `'goto'` (across `batch-engine`, `web-ui` types).

```typescript
export interface DAGGotoNode extends DAGNodeBase {
  type: 'goto';
  /** Target node id. Must equal the to-id of the (single) outgoing edge. */
  target: string;
}
```

`RecipeDAG` gains an optional `options.maxRevisits`:

```typescript
export interface RecipeDAG {
  schema_version: 2;
  nodes: DAGNode[];
  edges: DAGEdge[];
  options?: {
    /** Maximum visits per node. Default 1 (acyclic only). >1 enables Goto back-edges. */
    maxRevisits?: number;
  };
}
```

### Execution semantics
DAGExecutor.advance() treats `goto` like start/phase: take the (single) outgoing edge. Editor + recipe-validator enforce that there is exactly 1 out-edge whose `to` equals `target`. The redundant `target` field lets the editor display "Goto: <target>" without graph traversal.

### BatchController forwards `recipe.dag.options.maxRevisits`
`start()` and `resumeBatch()` now construct the executor with `{ maxRevisits: dag.options?.maxRevisits ?? 1 }` so back-edges are opt-in per recipe without any controller-construction signature change. Default 1 keeps v1.7-v1.10 behavior intact.

### Validator rules (recipe-validator)
- **BV-18**: Goto must have exactly 1 outgoing edge
- **BV-19**: `goto.target` must equal its out-edge's `to` (field/graph consistency)
- **BV-20**: `goto.target` cannot be a `start` node (would re-init state)
- **BV-21**: `goto.target` must be an existing node id
- **BV-15**: now ignores Goto out-edges (Goto's whole purpose is to be a soft back-edge; runtime safety is enforced by `maxRevisits`)
- **BV-16**: reachability BFS now uses the full edge set (so Goto-only-reachable phases are correctly counted as reachable)

### Editor changes
- New `GotoNode` react-flow component (violet styling, single source/target handle)
- `RecipeGraphEditor` palette gets a "Goto 跳转" button next to "IF/ELSE 分支"
- `RecipeGraphEditor` save-time validation enforces BV-18..BV-21 client-side
- `flowToDag` keeps `goto.target` in sync with the user-drawn out-edge automatically
- `NodeInspector` renders a target-node dropdown for Goto nodes (filters out self + start), plus an optional display name

## Tests

| Suite | v1.10.0 | v1.11.0 | Δ |
|---|---|---|---|
| `dag-executor.test.ts` | 18 | 23 | +5 |
| `batch-controller-dag.test.ts` | 12 | 15 | +3 |
| `batch-engine.test.ts` | 49 | 56 | +7 |
| **batch-engine total** | **100** | **115** | **+15** |
| server | 21 | 21 | unchanged |

Coverage:
- Goto pass-through routing (start → phase → goto → phase → end)
- Back-edge with default `maxRevisits=1` throws on first revisit
- Back-edge with `maxRevisits=3` allows 3 visits then throws
- `recipe.dag.options.maxRevisits` passthrough via DAGExecutor (5)
- Multi-node fwd-then-back cycle (a → b → goto → a) revisit accounting
- BatchController forwarding on `start()` (default + override) and `resumeBatch()`
- Each new validateDag rule (BV-18 0/2 out-edges, BV-19 mismatch, BV-20 start target, BV-21 unknown)
- Goto reachability is honored by BV-16; cycle suppression in BV-15

## Backward compatibility

- ✅ All existing dag-executor tests pass unchanged
- ✅ batch-controller-dag.test.ts pre-existing tests pass unchanged (linear, IF/ELSE, resumeBatch, branch_evaluated, perf)
- ✅ batch-engine.test.ts pre-existing tests pass unchanged
- ✅ server 21/21 pass
- ✅ Full monorepo `pnpm -r build` clean
- ✅ Default `maxRevisits=1` keeps acyclic-only behavior — existing recipes don't gain or lose execution semantics
- ✅ `current_node_id` SQLite column unchanged; **no migration**, **no `batches` schema change**

## What's NOT in this release

- ❌ No Loop nodes (B1.2's job — uses LoopFrame stack from v1.10.0)
- ❌ No conditional Goto (forward-compat ground; B1.5)
- ❌ No persistence change for `current_loop_frames` (waits for B1.2)
- ❌ Server / data-service versions unchanged

## Versions Bumped

| File | v1.10.0 | v1.11.0 |
|---|---|---|
| `package.json` (root) | 1.10.0 | **1.11.0** |
| `packages/batch-engine/package.json` | 0.3.0 | **0.3.1** |
| `packages/web-ui/package.json` | 0.3.1 | **0.3.2** |

server / data-service / types / others unchanged.

## Path forward

Next steps:
1. **B1.2 Loop nodes** — pair LoopFrame stack (v1.10.0 P3) with explicit `DAGLoopNode` type, push/pop on entry/exit, persist `current_loop_frames`
2. **B1.5 Conditional Goto** (later) — augment `DAGGotoNode` with optional `condition` expression, reusing the branch evaluator path

## Upgrade

```bash
git checkout v1.11.0
pnpm -r build
docker compose up -d --build biocore-server  # if running via compose
```

No schema change, no migration. Existing recipes continue running on the default `maxRevisits=1` cycle-block semantics.
