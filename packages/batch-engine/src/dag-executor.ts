// ============================================================
// DAGExecutor — Sprint 3 M3.6
//
// DAG 遍历器, 接受 RecipeDAG 输入, 给 batch-controller 用。
// 当前节点 = currentNodeId (替代老的 phaseIndex)。
//
// 支持节点类型: start / end / phase / branch
// 实现策略:
//   - phase 节点: 推进时调用 evalContext.onPhaseEntry(node)
//   - branch 节点: 调用 evalExpression 决定走 true/false 边
//   - 线性配方 (无 branch) 行为与老 PhaseExecutor 完全一致
//
// 该类纯数据结构 + 遍历逻辑, 不持有状态机, 不发事件。
// batch-controller 负责把 DAGExecutor 的 currentPhase() 接入 StepEngine。
// ============================================================

// 与 server/src/recipe-dag.ts 保持一致 (避免 batch-engine 包反向依赖 server)
export type DAGNodeType = 'start' | 'end' | 'phase' | 'branch';

export interface DAGNodeBase {
  id: string;
  type: DAGNodeType;
}
export interface DAGStartNode extends DAGNodeBase { type: 'start'; }
export interface DAGEndNode extends DAGNodeBase { type: 'end'; }
export interface DAGPhaseNode extends DAGNodeBase {
  type: 'phase';
  phase_id: string;
  phase_type: string;
  params?: Record<string, any>;
}
export interface DAGBranchNode extends DAGNodeBase {
  type: 'branch';
  expression: string;
  /**
   * Fallback branch to take when `ctx.evaluateExpression` throws
   * (e.g., PV not yet available). Defaults to `'false'` when omitted.
   */
  default_branch?: 'true' | 'false';
}
export type DAGNode = DAGStartNode | DAGEndNode | DAGPhaseNode | DAGBranchNode;

export interface DAGEdge {
  id: string;
  from: string;
  to: string;
  label?: 'true' | 'false';
}

export interface RecipeDAG {
  schema_version: 2;
  nodes: DAGNode[];
  edges: DAGEdge[];
}

/**
 * 求值上下文 — 由 batch-controller 注入, 给 branch 节点的表达式用。
 * fields 里的值在批次运行时会持续更新 (PV + phase_elapsed)。
 */
export interface DAGEvalContext {
  /** 执行表达式, 返回 bool。默认 impl 拒绝所有 (安全默认) */
  evaluateExpression: (expression: string) => boolean;
}

/**
 * DAGExecutor 配置项 (v1.10.0 P3)
 */
export interface DAGExecutorOptions {
  /**
   * Maximum number of times any single node may be visited during execution.
   * Default = 1 (matches v1.7-v1.9 behavior — cycles blocked).
   * Increase to enable Loop nodes (B1.2). The total upper bound on node
   * visits is enforced as a defense-in-depth even when LoopFrame says continue.
   */
  maxRevisits?: number;
}

/**
 * LoopFrame — execution context for a single active loop iteration.
 *
 * Future B1.2 Loop nodes push a frame on entry, increment iteration on each
 * cycle through, and pop on exit. The frame data model is intentionally
 * generic to absorb the four loop semantics under consideration:
 *   - fixed-N        → maxIterations set; no exitExpression
 *   - repeat-until   → exitExpression set; maxIterations as upper bound
 *   - repeat-while   → exitExpression set (negated by caller); same shape
 *   - time-bounded   → startedAt + maxDurationMs set
 *
 * P3 only ships the frame-stack PLUMBING. Loop node semantics (which fields
 * are required) belong to B1.2.
 */
export interface LoopFrame {
  /** ID of the DAGLoopNode that opened this frame (for crash recovery + audit). */
  loopNodeId: string;
  /** 0-indexed; bumped by Loop node logic on each cycle. */
  iteration: number;
  /** Optional ceiling — defense-in-depth for unbounded conditions. */
  maxIterations?: number;
  /** Optional condition expression evaluated each cycle (B1.2 wires this). */
  exitExpression?: string;
  /** Optional time origin (ms since epoch) for time-bounded loops. */
  startedAt?: number;
  /** Optional time ceiling for time-bounded loops. */
  maxDurationMs?: number;
}

/**
 * DAG 执行器
 *
 * 用法:
 * ```ts
 * const exec = new DAGExecutor(dag);
 * exec.start();                         // 推进到第一个 phase 节点
 * while (exec.hasCurrentPhase()) {
 *   const phase = exec.currentPhase();  // 拿到当前 phase
 *   await runPhase(phase);              // 执行 (外部逻辑)
 *   exec.advance(ctx);                  // 推进到下一个节点
 * }
 * ```
 */
export class DAGExecutor {
  private dag: RecipeDAG;
  private currentNodeId: string | null = null;
  private visitCount: Map<string, number> = new Map();
  private readonly maxRevisits: number;
  private readonly options: Required<DAGExecutorOptions>;
  private loopFrames: LoopFrame[] = [];

  constructor(dag: RecipeDAG, options: DAGExecutorOptions = {}) {
    this.dag = dag;
    this.maxRevisits = options.maxRevisits ?? 1;
    this.options = { maxRevisits: this.maxRevisits };
  }

  /**
   * 初始化: 找到 start 节点并推进到第一个 phase 节点 (或 end)
   */
  start(ctx?: DAGEvalContext): void {
    const startNode = this.dag.nodes.find(n => n.type === 'start');
    if (!startNode) throw new Error('DAG 没有 start 节点');
    this.currentNodeId = startNode.id;
    this.visitCount.clear();
    this.visitCount.set(startNode.id, 1);
    this.loopFrames = [];
    // 推进到第一个 phase 节点 (跳过 start / branch)
    this.advanceToPhaseOrEnd(ctx);
  }

  /**
   * 推进到下一个节点。处理 branch (按表达式求值选边) 和 phase (取第一条出边)。
   * 返回 true 表示成功推进, false 表示已到 end 或无路径。
   */
  advance(ctx?: DAGEvalContext): boolean {
    if (!this.currentNodeId) return false;
    const node = this.getNode(this.currentNodeId);
    if (!node || node.type === 'end') return false;

    const outEdges = this.dag.edges.filter(e => e.from === this.currentNodeId);
    if (outEdges.length === 0) {
      this.currentNodeId = null;
      return false;
    }

    let nextId: string;
    if (node.type === 'branch') {
      const branchNode = node as DAGBranchNode;
      const expr = branchNode.expression;
      let result: boolean;
      try {
        result = ctx?.evaluateExpression(expr) ?? false;
      } catch {
        result = (branchNode.default_branch ?? 'false') === 'true';
      }
      const targetLabel = result ? 'true' : 'false';
      const targetEdge = outEdges.find(e => e.label === targetLabel);
      if (!targetEdge) {
        throw new Error(`Branch 节点 ${node.id} 找不到 ${targetLabel} 出边`);
      }
      nextId = targetEdge.to;
    } else {
      // start / phase 节点: 取第一条边
      nextId = outEdges[0].to;
    }

    // 访问计数检测 (v1.10.0 P3): visitCount Map + maxRevisits
    // default maxRevisits=1 preserves v1.7-v1.9 cycle-blocking behavior
    const currentCount = this.visitCount.get(nextId) ?? 0;
    if (currentCount >= this.maxRevisits) {
      throw new Error(`MaxRevisitsExceeded: node '${nextId}' would exceed maxRevisits=${this.maxRevisits}`);
    }
    this.currentNodeId = nextId;
    this.visitCount.set(nextId, currentCount + 1);

    return true;
  }

  /**
   * 从当前节点起推进到第一个 phase、branch 或 end 节点。
   * 用于 start() 初始化时跳过 start 节点。
   * Branch 节点作为暂停点保留，等待调用方提供 ctx 后再 advance()。
   */
  private advanceToPhaseOrEnd(ctx?: DAGEvalContext): void {
    let guard = 0;
    while (this.currentNodeId) {
      const node = this.getNode(this.currentNodeId);
      if (!node) break;
      if (node.type === 'phase' || node.type === 'end' || node.type === 'branch') break;
      // start 节点需要推进
      const ok = this.advance(ctx);
      if (!ok) break;
      if (++guard > 1000) throw new Error('advanceToPhaseOrEnd 防护: 超过 1000 次推进');
    }
  }

  /**
   * 当前节点是否是 phase 节点, 可以执行
   */
  hasCurrentPhase(): boolean {
    const node = this.getCurrentNode();
    return node?.type === 'phase';
  }

  /**
   * 当前 phase (若非 phase 节点返回 null)
   */
  currentPhase(): { phase_id: string; phase_type: string; params: Record<string, any>; node_id: string } | null {
    const node = this.getCurrentNode();
    if (!node || node.type !== 'phase') return null;
    const p = node as DAGPhaseNode;
    return {
      phase_id: p.phase_id,
      phase_type: p.phase_type,
      params: p.params || {},
      node_id: p.id,
    };
  }

  /**
   * 当前节点 (任意类型)
   */
  getCurrentNode(): DAGNode | null {
    if (!this.currentNodeId) return null;
    return this.getNode(this.currentNodeId);
  }

  /**
   * 从起点计算所有可能的 phase 节点 (忽略 branch 条件, 全部展开)。
   * 用于 batch-controller 初始化 phaseStatuses (显示配方 phase 总数)。
   */
  getAllPhases(): { phase_id: string; phase_type: string; params: Record<string, any>; node_id: string; index: number }[] {
    return this.dag.nodes
      .filter(n => n.type === 'phase')
      .map((n, idx) => {
        const p = n as DAGPhaseNode;
        return {
          phase_id: p.phase_id,
          phase_type: p.phase_type,
          params: p.params || {},
          node_id: p.id,
          index: idx,
        };
      });
  }

  /**
   * 判断 DAG 是否完整遍历结束 (当前节点为 end 或 null)
   */
  isComplete(): boolean {
    if (!this.currentNodeId) return true;
    const node = this.getCurrentNode();
    return node?.type === 'end';
  }

  /**
   * 重置到 start (重跑用)
   */
  reset(): void {
    this.currentNodeId = null;
    this.visitCount.clear();
    this.loopFrames = [];
  }

  // ==================================================================
  // LoopFrame stack API (v1.10.0 P3)
  //
  // Frame-stack plumbing for B1.2 (Loop) and B1.4 (SubRecipe). No node
  // type currently uses these methods — they are infrastructure-only.
  // ==================================================================

  /** Push a frame onto the loop stack. Used by future Loop node enter handler. */
  pushFrame(frame: LoopFrame): void {
    this.loopFrames.push({ ...frame });
  }

  /** Pop the top frame. Returns undefined if stack empty. */
  popFrame(): LoopFrame | undefined {
    return this.loopFrames.pop();
  }

  /** Peek the top frame without removing. */
  peekFrame(): LoopFrame | undefined {
    return this.loopFrames[this.loopFrames.length - 1];
  }

  /** Mutate the top frame's iteration counter. Returns new iteration. Throws if stack empty. */
  incrementFrameIteration(): number {
    const top = this.loopFrames[this.loopFrames.length - 1];
    if (!top) throw new Error('incrementFrameIteration called with empty loop stack');
    top.iteration += 1;
    return top.iteration;
  }

  /** Snapshot the frame stack (for persistence — JSON-safe). */
  snapshotFrames(): LoopFrame[] {
    return this.loopFrames.map(f => ({ ...f }));
  }

  /** Restore frame stack from snapshot (for crash recovery). */
  restoreFrames(frames: LoopFrame[]): void {
    this.loopFrames = frames.map(f => ({ ...f }));
  }

  /** Current depth of the frame stack (0 = no active loops). */
  get frameDepth(): number {
    return this.loopFrames.length;
  }

  private getNode(id: string): DAGNode | null {
    return this.dag.nodes.find(n => n.id === id) || null;
  }
}

// ============================================================
// linearToDag — v1 线性 phases[] → v2 RecipeDAG (T6)
//
// 转换规则: start → n_0 → n_1 → ... → n_{n-1} → end
// 节点 ID 确定式格式: n_start / n_<index> / n_end
// 边 ID 格式: e_start_0 / e_<i>_<i+1> / e_<n-1>_end / e_start_end (空配方)
// ============================================================
export function linearToDag(phases: Array<{ phase_id?: string; type: string; params?: Record<string, any> }>): RecipeDAG {
  const nodes: DAGNode[] = [];
  const edges: DAGEdge[] = [];

  // 1. start 节点
  nodes.push({ id: 'n_start', type: 'start' });

  // 2. 每个 phase 一个节点
  phases.forEach((p, i) => {
    nodes.push({
      id: `n_${i}`,
      type: 'phase',
      phase_id: p.phase_id ?? `phase_${i}`,
      phase_type: p.type,
      params: p.params ?? {},
    } as DAGPhaseNode);
  });

  // 3. end 节点
  nodes.push({ id: 'n_end', type: 'end' });

  // 4. 边: start → 0 → 1 → ... → n-1 → end
  if (phases.length === 0) {
    // 空配方: start → end
    edges.push({ id: 'e_start_end', from: 'n_start', to: 'n_end' });
  } else {
    edges.push({ id: 'e_start_0', from: 'n_start', to: 'n_0' });
    for (let i = 0; i < phases.length - 1; i++) {
      edges.push({ id: `e_${i}_${i + 1}`, from: `n_${i}`, to: `n_${i + 1}` });
    }
    edges.push({ id: `e_${phases.length - 1}_end`, from: `n_${phases.length - 1}`, to: 'n_end' });
  }

  return { schema_version: 2, nodes, edges };
}

// ============================================================
// 自测块
// ============================================================
if (require.main === module) {
  // Test 1: 线性 DAG (无 branch)
  const linearDag: RecipeDAG = {
    schema_version: 2,
    nodes: [
      { id: 'n_start', type: 'start' },
      { id: 'n_a', type: 'phase', phase_id: 'A', phase_type: 'heating' },
      { id: 'n_b', type: 'phase', phase_id: 'B', phase_type: 'fermentation' },
      { id: 'n_c', type: 'phase', phase_id: 'C', phase_type: 'cooling' },
      { id: 'n_end', type: 'end' },
    ],
    edges: [
      { id: 'e1', from: 'n_start', to: 'n_a' },
      { id: 'e2', from: 'n_a', to: 'n_b' },
      { id: 'e3', from: 'n_b', to: 'n_c' },
      { id: 'e4', from: 'n_c', to: 'n_end' },
    ],
  };

  console.log('Test 1 — 线性 DAG:');
  const exec1 = new DAGExecutor(linearDag);
  exec1.start();
  const phases: string[] = [];
  while (exec1.hasCurrentPhase()) {
    const p = exec1.currentPhase();
    if (p) phases.push(p.phase_id);
    exec1.advance();
  }
  console.log(`  phases visited: ${phases.join(' → ')}`);
  console.log(`  ${phases.join(',') === 'A,B,C' ? '✓' : '✗'} 顺序 A → B → C`);
  console.log(`  ${exec1.isComplete() ? '✓' : '✗'} isComplete()`);

  // Test 2: branch DAG - true path
  const branchDag: RecipeDAG = {
    schema_version: 2,
    nodes: [
      { id: 'n_start', type: 'start' },
      { id: 'n_a', type: 'phase', phase_id: 'A', phase_type: 'heating' },
      { id: 'n_b', type: 'branch', expression: 'OD600 > 5' },
      { id: 'n_c', type: 'phase', phase_id: 'C', phase_type: 'fermentation' },
      { id: 'n_d', type: 'phase', phase_id: 'D', phase_type: 'cooling' },
      { id: 'n_end', type: 'end' },
    ],
    edges: [
      { id: 'e1', from: 'n_start', to: 'n_a' },
      { id: 'e2', from: 'n_a', to: 'n_b' },
      { id: 'e3', from: 'n_b', to: 'n_c', label: 'true' },
      { id: 'e4', from: 'n_b', to: 'n_d', label: 'false' },
      { id: 'e5', from: 'n_c', to: 'n_end' },
      { id: 'e6', from: 'n_d', to: 'n_end' },
    ],
  };

  console.log('Test 2 — branch DAG (true 路径):');
  const ctxTrue: DAGEvalContext = { evaluateExpression: () => true };
  const exec2 = new DAGExecutor(branchDag);
  exec2.start(ctxTrue);
  const pathTrue: string[] = [];
  while (exec2.hasCurrentPhase()) {
    const p = exec2.currentPhase();
    if (p) pathTrue.push(p.phase_id);
    exec2.advance(ctxTrue);
  }
  console.log(`  phases: ${pathTrue.join(' → ')}`);
  console.log(`  ${pathTrue.join(',') === 'A,C' ? '✓' : '✗'} A → C (skipping D)`);

  console.log('Test 3 — branch DAG (false 路径):');
  const ctxFalse: DAGEvalContext = { evaluateExpression: () => false };
  const exec3 = new DAGExecutor(branchDag);
  exec3.start(ctxFalse);
  const pathFalse: string[] = [];
  while (exec3.hasCurrentPhase()) {
    const p = exec3.currentPhase();
    if (p) pathFalse.push(p.phase_id);
    exec3.advance(ctxFalse);
  }
  console.log(`  phases: ${pathFalse.join(' → ')}`);
  console.log(`  ${pathFalse.join(',') === 'A,D' ? '✓' : '✗'} A → D (skipping C)`);

  console.log('Test 4 — getAllPhases:');
  const allPhases = new DAGExecutor(branchDag).getAllPhases();
  console.log(`  total: ${allPhases.length} (期望 3)`);
  console.log(`  ${allPhases.length === 3 ? '✓' : '✗'} 展开所有 phase (忽略 branch)`);

  console.log('Test 5 — 环检测:');
  const cycleDag: RecipeDAG = {
    schema_version: 2,
    nodes: [
      { id: 'n_start', type: 'start' },
      { id: 'n_a', type: 'phase', phase_id: 'A', phase_type: 'heating' },
      { id: 'n_b', type: 'phase', phase_id: 'B', phase_type: 'fermentation' },
      { id: 'n_end', type: 'end' },
    ],
    edges: [
      { id: 'e1', from: 'n_start', to: 'n_a' },
      { id: 'e2', from: 'n_a', to: 'n_b' },
      { id: 'e3', from: 'n_b', to: 'n_a' }, // 环
    ],
  };
  try {
    const execCycle = new DAGExecutor(cycleDag);
    execCycle.start();
    while (execCycle.hasCurrentPhase()) execCycle.advance();
    console.log('  ✗ 应该抛错但没抛');
  } catch (e) {
    const msg = (e as Error).message;
    const ok = msg.includes('MaxRevisitsExceeded');
    console.log(`  ${ok ? '✓' : '✗'} 环被 MaxRevisitsExceeded 捕获: ${msg.slice(0, 60)}`);
  }

  console.log('\n所有单测通过');
}
