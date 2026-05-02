// ============================================================
// recipe-dag.ts — 配方 DAG 工具 (Sprint 3 M3.5)
//
// 提供线性 phases ↔ DAG 的双向转换 + DAG 遍历。
// 用于:
//   1. M3.5 兼容层: 老 POST /recipes 给 phases 数组,后端转 DAG 存储
//   2. M3.5 兼容层: 老 GET /recipes 把 v2 DAG 还原为 phases 数组(仅当无 branch)
//   3. M3.6 DAGExecutor 走图执行
// ============================================================

// 与 web-ui/src/types 保持一致 (避免 server 包跨包 import)
export type DAGNodeType = 'start' | 'end' | 'phase' | 'branch' | 'goto' | 'loop';

export interface DAGNodeBase {
  id: string;
  type: DAGNodeType;
  position?: { x: number; y: number };
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
  default_branch?: 'true' | 'false';
}
/** Goto (B1.3) — pass-through to a target node. */
export interface DAGGotoNode extends DAGNodeBase {
  type: 'goto';
  target: string;
}
/** Loop (B1.2) — repeat-until / fixed-N node. */
export interface DAGLoopNode extends DAGNodeBase {
  type: 'loop';
  exitExpression?: string;
  maxIterations?: number;
}
export type DAGNode = DAGStartNode | DAGEndNode | DAGPhaseNode | DAGBranchNode | DAGGotoNode | DAGLoopNode;

export interface DAGEdge {
  id: string;
  from: string;
  to: string;
  label?: 'true' | 'false' | 'body' | 'exit';
}

export interface RecipeDAG {
  schema_version: 2;
  nodes: DAGNode[];
  edges: DAGEdge[];
}

// ============================================================
// linearToDag — 线性 phases 数组 → DAG
//
// 转换规则: start → phase[0] → phase[1] → ... → phase[n-1] → end
// 节点 ID 用确定式格式 (n_<index>) 方便测试 + 老配方迁移幂等。
// ============================================================
export function linearToDag(phases: Array<{ phase_id: string; type: string; params?: any }>): RecipeDAG {
  const nodes: DAGNode[] = [];
  const edges: DAGEdge[] = [];

  // 1. start 节点
  nodes.push({ id: 'n_start', type: 'start' });

  // 2. 每个 phase 一个节点
  phases.forEach((p, i) => {
    nodes.push({
      id: `n_${i}`,
      type: 'phase',
      phase_id: p.phase_id,
      phase_type: p.type,
      params: p.params || {},
    });
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
// dagToLinear — DAG → 线性 phases 数组
//
// 仅当 DAG 无 branch 节点 + 单一 start + 单一 end + 无环时合法。
// 否则抛错 (告诉调用方:这个 DAG 不能在老编辑器打开,需要 v2 编辑器)。
//
// 实现: 从 start 出发 BFS, 沿单一出边推进, 收集 phase 节点。
// ============================================================
export function dagToLinear(dag: RecipeDAG): Array<{ phase_id: string; type: string; params?: any }> {
  // 校验
  const branches = dag.nodes.filter(n => n.type === 'branch');
  if (branches.length > 0) {
    throw new Error(`DAG 含 ${branches.length} 个 branch 节点, 不能转为线性配方 (请用 v2 编辑器)`);
  }
  const gotos = dag.nodes.filter(n => n.type === 'goto');
  if (gotos.length > 0) {
    throw new Error(`DAG 含 ${gotos.length} 个 goto 节点, 不能转为线性配方 (请用 v2 编辑器)`);
  }
  const loops = dag.nodes.filter(n => n.type === 'loop');
  if (loops.length > 0) {
    throw new Error(`DAG 含 ${loops.length} 个 loop 节点, 不能转为线性配方 (请用 v2 编辑器)`);
  }

  const starts = dag.nodes.filter(n => n.type === 'start');
  if (starts.length !== 1) {
    throw new Error(`DAG 必须恰好 1 个 start 节点, 实际 ${starts.length}`);
  }

  const phaseList: Array<{ phase_id: string; type: string; params?: any }> = [];
  const visited = new Set<string>();
  let currentId = starts[0].id;

  // 沿单链遍历
  while (true) {
    if (visited.has(currentId)) {
      throw new Error(`检测到环, 节点 ${currentId} 重复访问`);
    }
    visited.add(currentId);

    const node = dag.nodes.find(n => n.id === currentId);
    if (!node) throw new Error(`找不到节点 ${currentId}`);

    if (node.type === 'phase') {
      phaseList.push({
        phase_id: node.phase_id,
        type: node.phase_type,
        params: node.params,
      });
    }
    if (node.type === 'end') break;

    const outEdges = dag.edges.filter(e => e.from === currentId);
    if (outEdges.length === 0) {
      throw new Error(`节点 ${currentId} 没有出边但不是 end`);
    }
    if (outEdges.length > 1) {
      throw new Error(`节点 ${currentId} 有 ${outEdges.length} 条出边, 线性配方不允许分叉`);
    }
    currentId = outEdges[0].to;
  }

  return phaseList;
}

// ============================================================
// walkDag — DAG 遍历器, M3.6 DAGExecutor 用
//
// 给定 DAG 和当前节点 ID, 返回下一个节点 ID。
// 如果是 branch 节点, 调用 evalFn(expression) 决定走 true/false 边。
// ============================================================
export function walkDag(
  dag: RecipeDAG,
  currentId: string,
  evalFn: (expression: string) => boolean,
): string | null {
  const node = dag.nodes.find(n => n.id === currentId);
  if (!node) return null;
  if (node.type === 'end') return null;

  const outEdges = dag.edges.filter(e => e.from === currentId);
  if (outEdges.length === 0) return null;

  if (node.type === 'branch') {
    const result = evalFn(node.expression);
    const targetLabel = result ? 'true' : 'false';
    const branchEdge = outEdges.find(e => e.label === targetLabel);
    if (!branchEdge) return null;
    return branchEdge.to;
  }

  // start / phase: 取第一条边
  return outEdges[0].to;
}

// ============================================================
// 工具函数
// ============================================================

/** 找到 DAG 的 start 节点 ID */
export function findStartNodeId(dag: RecipeDAG): string | null {
  const start = dag.nodes.find(n => n.type === 'start');
  return start?.id || null;
}

/** DAG 是否纯线性 (无 branch) */
export function isLinearDag(dag: RecipeDAG): boolean {
  return dag.nodes.every(n => n.type !== 'branch');
}

/** 从 phase 节点取 phase_id (DAGExecutor 用) */
export function getPhaseFromNode(node: DAGNode): { phase_id: string; type: string; params?: any } | null {
  if (node.type !== 'phase') return null;
  return { phase_id: node.phase_id, type: node.phase_type, params: node.params };
}

// ============================================================
// 自测块
// ============================================================
if (require.main === module) {
  // Test 1: 空配方
  const empty = linearToDag([]);
  console.log('Test 1 — 空配方:');
  console.log(`  nodes: ${empty.nodes.length}, edges: ${empty.edges.length}`);
  console.log(`  ${dagToLinear(empty).length === 0 ? '✓' : '✗'} dagToLinear 返回 []`);

  // Test 2: 3 phase 线性配方
  const phases3 = [
    { phase_id: 'HEAT_01', type: 'heating', params: { temp: 37 } },
    { phase_id: 'FERM_01', type: 'fermentation', params: { duration_h: 24 } },
    { phase_id: 'COOL_01', type: 'cooling', params: { temp: 4 } },
  ];
  const dag3 = linearToDag(phases3);
  console.log('Test 2 — 3 phase 线性配方:');
  console.log(`  nodes: ${dag3.nodes.length} (期望 5: start + 3 + end)`);
  console.log(`  edges: ${dag3.edges.length} (期望 4)`);
  const back = dagToLinear(dag3);
  console.log(`  ${JSON.stringify(back) === JSON.stringify(phases3) ? '✓' : '✗'} 往返一致`);

  // Test 3: walkDag 线性遍历
  console.log('Test 3 — walkDag 线性遍历:');
  let cur: string | null = 'n_start';
  const path: string[] = [];
  while (cur) {
    path.push(cur);
    cur = walkDag(dag3, cur, () => true);
  }
  console.log(`  路径: ${path.join(' → ')}`);
  console.log(`  ${path.length === 5 ? '✓' : '✗'} 5 个节点全访问`);

  // Test 4: branch DAG
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
  console.log('Test 4 — branch DAG:');
  // true 路径
  let pathTrue: string[] = [];
  cur = 'n_start';
  while (cur) { pathTrue.push(cur); cur = walkDag(branchDag, cur, () => true); }
  console.log(`  true 路径: ${pathTrue.join(' → ')}`);
  console.log(`  ${pathTrue.includes('n_c') && !pathTrue.includes('n_d') ? '✓' : '✗'} 走 true 边到 n_c`);
  // false 路径
  let pathFalse: string[] = [];
  cur = 'n_start';
  while (cur) { pathFalse.push(cur); cur = walkDag(branchDag, cur, () => false); }
  console.log(`  false 路径: ${pathFalse.join(' → ')}`);
  console.log(`  ${pathFalse.includes('n_d') && !pathFalse.includes('n_c') ? '✓' : '✗'} 走 false 边到 n_d`);

  // Test 5: dagToLinear 在 branch DAG 上抛错
  console.log('Test 5 — branch DAG 不能转 linear:');
  try {
    dagToLinear(branchDag);
    console.log('  ✗ 应该抛错但没抛');
  } catch (e) {
    console.log(`  ✓ 抛错: ${(e as Error).message.slice(0, 60)}`);
  }
}
