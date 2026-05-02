# BIOCore v1.10.0 — P3 Frame-Stack Infrastructure

**Release Date:** 2026-05-02
**Type:** Minor — DAGExecutor API additions, behavior preserving
**Tag:** `v1.10.0`

## TL;DR
DAGExecutor 加 frame-stack 基建，为 B1.2 Loop 节点（即将到来）和 B1.4 SubRecipe（更后）铺路。**对 v1.9.x 无任何行为变化**：默认 `maxRevisits=1` 完全等同于原 visited Set 的环检测语义。

## API additions

### `DAGExecutor` constructor 加可选 options

```typescript
const exec = new DAGExecutor(dag, { maxRevisits: 1 });  // default = 1
```

`maxRevisits` 是节点访问次数上限。`1` = 旧行为（环立刻被拒）。`>1` = 允许 Loop 节点回访同一节点 N 次。超过即抛 `MaxRevisitsExceeded` 错误（保留 readyNextPhase 的 `guard > 1000` 作为外层防御）。

### `LoopFrame` interface

```typescript
export interface LoopFrame {
  loopNodeId: string;
  iteration: number;
  maxIterations?: number;
  exitExpression?: string;
  startedAt?: number;
  maxDurationMs?: number;
}
```

通用形态，能吸收 4 种 loop 语义（fixed-N / repeat-until / repeat-while / time-bounded）。哪些字段必填由 B1.2 决定。

### Frame stack 公共方法

```typescript
exec.pushFrame(frame: LoopFrame): void
exec.popFrame(): LoopFrame | undefined
exec.peekFrame(): LoopFrame | undefined
exec.incrementFrameIteration(): number
exec.snapshotFrames(): LoopFrame[]    // 用于持久化（深拷贝）
exec.restoreFrames(frames: LoopFrame[]): void  // 用于崩溃恢复
exec.frameDepth: number  // getter
```

`start()` 自动清空 loopFrames。

## What's NOT in this release

- ❌ 无新 DAG 节点类型（`DAGLoopNode` / `DAGSubRecipeNode` 是 B1.2/B1.4）
- ❌ 无 schema/migration 变化（`current_node_id` 不变；frame 持久化由 B1.2 加列）
- ❌ `BatchController` 不调用 push/pop/peek（节点类型加进来后才会）
- ❌ 无 `BatchControllerConfig` 修改（构造签名不变）

## Backward compatibility

✅ 全部 4 个旧 dag-executor 测试不动通过  
✅ batch-controller-dag.test.ts 12 测试不动通过（含 IF/ELSE 分支求值 + crash recovery + branch_evaluated 事件）  
✅ batch-engine.test.ts 49 测试不动  
✅ 全 monorepo build clean  
✅ MOCK_PLC server 启动 v1.10.0 banner，登录正常，`/admin/metrics` 401

新增 14 测试覆盖 visitCount + LoopFrame stack + 向后兼容三个分组。batch-engine 总测试数 86 → **100**。

## Versions Bumped

| File | v1.9.0 | v1.10.0 |
|---|---|---|
| `package.json` (root) | 1.9.0 | **1.10.0** |
| `packages/batch-engine/package.json` | 0.2.3 | **0.3.0** |

server / data-service / web-ui 不动。

## Path forward

下一步推荐：

1. **B1.2 brainstorm** Q2-N（loop 语义选择）→ spec → plan
2. **B1.2 实施**：基于本次 frame-stack，加 `DAGLoopNode` 类型 + 编辑器支持 + 持久化（migration 加 `batches.current_loop_frames` JSON 列）+ `BatchController` 在 readyNextPhase 触发 push/pop

## Upgrade

```bash
docker compose stop biocore-server
git checkout v1.10.0
docker compose up -d --build biocore-server
```

无 schema 变化，无 migration，无需停 batch。
