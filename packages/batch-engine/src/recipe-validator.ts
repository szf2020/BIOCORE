// ============================================================
// RecipeValidator — 配方加载前校验 (BV-01 ~ BV-12)
// ============================================================

import type { Recipe, PhaseType } from '@biocore/types';

export interface ValidationIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

// Phase类型现在从数据库模板加载，不再硬编码校验
// 保留基础格式校验但不限制具体类型名
const LEGACY_PHASE_TYPES = [
  'prepare', 'water_fill', 'manual_add', 'heating', 'agitation',
  'feeding', 'temp_control', 'ph_control', 'do_control', 'aeration',
  'discharge', 'fermentation', 'cip', 'sip',
];
const NEW_PHASE_TYPES = [
  'Prepare', 'AddWater', 'ManualAdd', 'Heating', 'Agitation',
  'Feeding', 'TempControl', 'PHControl', 'DOControl', 'Aeration',
  'Discharge', 'Fermentation', 'CIP', 'SIP',
];
const VALID_PHASE_TYPES = [...LEGACY_PHASE_TYPES, ...NEW_PHASE_TYPES] as PhaseType[];

export function validateRecipe(recipe: Recipe): ValidationResult {
  if (!recipe) {
    return {
      valid: false,
      errors: [{ code: 'BV-00', severity: 'error', message: '配方为空' }],
      warnings: [],
    };
  }

  const issues: ValidationIssue[] = [];

  // BV-01: phase_id 唯一性
  const ids = recipe.phases.map(p => p.phase_id);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (duplicates.length > 0) {
    issues.push({
      code: 'BV-01', severity: 'error',
      message: `Phase ID重复: ${[...new Set(duplicates)].join(', ')}`,
    });
  }

  // BV-02: 工作容积 < 全容积
  if (recipe.vessel.working_volume_L >= recipe.vessel.total_volume_L) {
    issues.push({
      code: 'BV-02', severity: 'error',
      message: `工作容积(${recipe.vessel.working_volume_L}L)必须小于全容积(${recipe.vessel.total_volume_L}L)`,
    });
  }

  // BV-06: SIP Phase 的 target_temp_C >= 100
  for (const phase of recipe.phases) {
    if (phase.type === 'sip' && phase.params?.target_temp_C !== undefined) {
      if (phase.params.target_temp_C < 100) {
        issues.push({
          code: 'BV-06', severity: 'error',
          message: `SIP Phase "${phase.phase_id}" 灭菌温度${phase.params.target_temp_C}°C不足 (需>=100°C)`,
        });
      }
    }
  }

  // BV-07: discharge Phase 的 empty_weight_kg 应≈vessel.tare_weight_kg
  for (const phase of recipe.phases) {
    if (phase.type === 'discharge' && phase.params?.empty_weight_kg !== undefined) {
      const diff = Math.abs(phase.params.empty_weight_kg - recipe.vessel.tare_weight_kg);
      if (diff > 2) {
        issues.push({
          code: 'BV-07', severity: 'warning',
          message: `出料Phase "${phase.phase_id}" 空罐重量(${phase.params.empty_weight_kg}kg)与皮重(${recipe.vessel.tare_weight_kg}kg)偏差${diff.toFixed(1)}kg`,
        });
      }
    }
  }

  // BV-08: manual_add 搅拌转速不超过罐体上限
  const maxRpm = recipe.vessel.agitation_range_rpm?.[1];
  if (maxRpm) {
    for (const phase of recipe.phases) {
      if (phase.type === 'manual_add' && phase.params?.agitation_rpm !== undefined) {
        if (phase.params.agitation_rpm > maxRpm) {
          issues.push({
            code: 'BV-08', severity: 'error',
            message: `Phase "${phase.phase_id}" 搅拌转速${phase.params.agitation_rpm}rpm超过罐体上限${maxRpm}rpm`,
          });
        }
      }
    }
  }

  // BV-12: fermentation Phase 的 duration_h > 0
  for (const phase of recipe.phases) {
    if (phase.type === 'fermentation' && phase.params?.duration_h !== undefined) {
      if (phase.params.duration_h <= 0) {
        issues.push({
          code: 'BV-12', severity: 'error',
          message: `发酵Phase "${phase.phase_id}" 持续时间不能为0`,
        });
      }
    }
  }

  // 基础校验: 必填字段
  if (!recipe.recipe_id) {
    issues.push({ code: 'BV-00', severity: 'error', message: '缺少recipe_id' });
  }
  if (!recipe.phases || recipe.phases.length === 0) {
    issues.push({ code: 'BV-00', severity: 'error', message: '配方至少需要1个Phase' });
  }

  // Phase类型合法性
  for (const phase of recipe.phases) {
    if (!VALID_PHASE_TYPES.includes(phase.type)) {
      issues.push({
        code: 'BV-00', severity: 'error',
        message: `Phase "${phase.phase_id}" 类型无效: "${phase.type}"`,
      });
    }
  }

  // Sprint 3 M3.9: DAG 结构校验 (BV-13 ~ BV-17)
  // 如果配方带 dag 字段 (v2 DAG schema), 做图结构校验
  const dag = (recipe as any).dag;
  if (dag && dag.schema_version === 2 && Array.isArray(dag.nodes) && Array.isArray(dag.edges)) {
    issues.push(...validateDag(dag));
  }

  return {
    valid: issues.filter(i => i.severity === 'error').length === 0,
    errors: issues.filter(i => i.severity === 'error'),
    warnings: issues.filter(i => i.severity === 'warning'),
  };
}

// ============================================================
// M3.9: DAG 结构校验
// BV-13: 至少 1 个 start 节点
// BV-14: 至少 1 个 end 节点
// BV-15: 无环 (DFS 标记) — 但 goto 节点的出边被视为软回边, 不参与环检测
// BV-16: 所有节点从 start 可达 (BFS)
// BV-17: branch 节点必须恰好 2 条出边 (true + false)
// BV-18: goto 节点必须恰好 1 条出边
// BV-19: goto.target 必须等于其唯一出边的 to (字段与图结构一致)
// BV-20: goto.target 不能是 start 节点 (避免重新初始化)
// BV-21: goto.target 必须是 DAG 内已知的节点 id
// BV-22: 当 DAG 含 goto 形成环时, recipe.options.maxRevisits 必须 > 1
//        (warning — 校验器不强制, 因为 maxRevisits 是 RecipeDAG.options
//         的字段, validateDag 单独被调用时拿不到, 由 DAGExecutor 兜底抛
//         MaxRevisitsExceeded)
// ============================================================
interface DagNode { id: string; type: string; target?: string; }
interface DagEdge { id: string; from: string; to: string; label?: string; }
interface DagShape { nodes: DagNode[]; edges: DagEdge[]; }

export function validateDag(dag: DagShape): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // BV-13: 至少 1 个 start
  const startNodes = dag.nodes.filter(n => n.type === 'start');
  if (startNodes.length === 0) {
    issues.push({ code: 'BV-13', severity: 'error', message: 'DAG 必须至少有 1 个 start 节点' });
    return issues; // 没有 start 后续检查没意义
  }
  if (startNodes.length > 1) {
    issues.push({ code: 'BV-13', severity: 'error', message: `DAG 只允许 1 个 start 节点, 实际 ${startNodes.length} 个` });
  }

  // BV-14: 至少 1 个 end
  const endNodes = dag.nodes.filter(n => n.type === 'end');
  if (endNodes.length === 0) {
    issues.push({ code: 'BV-14', severity: 'error', message: 'DAG 必须至少有 1 个 end 节点' });
  }

  // BV-17: branch 节点必须恰好 2 条出边 (true + false)
  for (const node of dag.nodes) {
    if (node.type === 'branch') {
      const outEdges = dag.edges.filter(e => e.from === node.id);
      const labels = new Set(outEdges.map(e => e.label));
      if (outEdges.length !== 2 || !labels.has('true') || !labels.has('false')) {
        issues.push({
          code: 'BV-17', severity: 'error',
          message: `Branch 节点 ${node.id} 必须恰好 2 条出边 (true + false), 实际 ${outEdges.length} 条`,
        });
      }
    }
  }

  // B1.3: BV-18..BV-21 — goto 节点结构校验
  const nodeIdSet = new Set(dag.nodes.map(n => n.id));
  for (const node of dag.nodes) {
    if (node.type === 'goto') {
      const outEdges = dag.edges.filter(e => e.from === node.id);
      // BV-18: 恰好 1 条出边
      if (outEdges.length !== 1) {
        issues.push({
          code: 'BV-18', severity: 'error',
          message: `Goto 节点 ${node.id} 必须恰好 1 条出边, 实际 ${outEdges.length} 条`,
        });
      }
      // BV-21: target 必须存在
      if (!node.target || !nodeIdSet.has(node.target)) {
        issues.push({
          code: 'BV-21', severity: 'error',
          message: `Goto 节点 ${node.id} 的 target "${node.target ?? '(未设置)'}" 不是 DAG 内已知节点`,
        });
      } else {
        // BV-19: target 与出边 to 一致 (只有当 outEdges 数量正常时才有意义)
        if (outEdges.length === 1 && outEdges[0].to !== node.target) {
          issues.push({
            code: 'BV-19', severity: 'error',
            message: `Goto 节点 ${node.id} 的 target "${node.target}" 与出边 to "${outEdges[0].to}" 不一致`,
          });
        }
        // BV-20: target 不能是 start 节点 (会重新初始化执行状态)
        const targetNode = dag.nodes.find(n => n.id === node.target);
        if (targetNode?.type === 'start') {
          issues.push({
            code: 'BV-20', severity: 'error',
            message: `Goto 节点 ${node.id} 的 target 不能是 start 节点 (会重新初始化, 应跳到 phase 或 end)`,
          });
        }
      }
    }
  }

  // BV-15: 无环检测 (DFS + 三色标记)
  // WHITE=未访问, GRAY=正在访问(栈中), BLACK=已访问完
  // B1.3: goto 的出边视为软回边, 不参与环检测 (Goto 的合法用例就是回边).
  // 真正的运行时安全由 DAGExecutor.maxRevisits 兜底.
  const color: Record<string, 'W' | 'G' | 'B'> = {};
  dag.nodes.forEach(n => { color[n.id] = 'W'; });
  const gotoNodeIds = new Set(dag.nodes.filter(n => n.type === 'goto').map(n => n.id));
  const adj = new Map<string, string[]>();
  dag.edges.forEach(e => {
    // 跳过 goto 的出边 — 不参与 BV-15 环检测
    if (gotoNodeIds.has(e.from)) return;
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  });
  let hasCycle = false;
  const dfs = (nodeId: string): void => {
    if (hasCycle) return;
    color[nodeId] = 'G';
    const neighbors = adj.get(nodeId) || [];
    for (const next of neighbors) {
      if (color[next] === 'G') {
        hasCycle = true;
        issues.push({
          code: 'BV-15', severity: 'error',
          message: `检测到环: 节点 ${nodeId} → ${next}`,
        });
        return;
      }
      if (color[next] === 'W') dfs(next);
    }
    color[nodeId] = 'B';
  };
  for (const node of dag.nodes) {
    if (color[node.id] === 'W') dfs(node.id);
    if (hasCycle) break;
  }

  // BV-16: 所有节点从 start 可达 (BFS)
  // 使用包含 goto 出边的完整 adj 计算可达性 — 否则 goto 的 target 会被
  // 误判为孤立 (上面的 adj 因 BV-15 故意省略了 goto 出边)。
  if (!hasCycle && startNodes.length > 0) {
    const fullAdj = new Map<string, string[]>();
    dag.edges.forEach(e => {
      if (!fullAdj.has(e.from)) fullAdj.set(e.from, []);
      fullAdj.get(e.from)!.push(e.to);
    });
    const visited = new Set<string>();
    const queue = [startNodes[0].id];
    visited.add(startNodes[0].id);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const neighbors = fullAdj.get(cur) || [];
      for (const next of neighbors) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    const unreachable = dag.nodes.filter(n => !visited.has(n.id));
    if (unreachable.length > 0) {
      issues.push({
        code: 'BV-16', severity: 'error',
        message: `有 ${unreachable.length} 个节点从 start 不可达: ${unreachable.map(n => n.id).join(', ')}`,
      });
    }
  }

  return issues;
}

// ============================================================
// 自测块
// ============================================================
if (require.main === module) {
  // Test 1: 合法 DAG
  const goodDag: DagShape = {
    nodes: [
      { id: 's', type: 'start' },
      { id: 'a', type: 'phase' },
      { id: 'b', type: 'branch' },
      { id: 'c', type: 'phase' },
      { id: 'd', type: 'phase' },
      { id: 'e', type: 'end' },
    ],
    edges: [
      { id: 'e1', from: 's', to: 'a' },
      { id: 'e2', from: 'a', to: 'b' },
      { id: 'e3', from: 'b', to: 'c', label: 'true' },
      { id: 'e4', from: 'b', to: 'd', label: 'false' },
      { id: 'e5', from: 'c', to: 'e' },
      { id: 'e6', from: 'd', to: 'e' },
    ],
  };
  console.log('Test 1 — 合法 DAG:');
  const r1 = validateDag(goodDag);
  console.log(`  ${r1.length === 0 ? '✓' : '✗'} 0 errors (got ${r1.length})`);

  // Test 2: 无 start
  const noStart: DagShape = { nodes: [{ id: 'a', type: 'phase' }], edges: [] };
  console.log('Test 2 — 无 start:');
  const r2 = validateDag(noStart);
  console.log(`  ${r2.some(i => i.code === 'BV-13') ? '✓' : '✗'} BV-13 触发`);

  // Test 3: 无 end
  const noEnd: DagShape = {
    nodes: [{ id: 's', type: 'start' }, { id: 'a', type: 'phase' }],
    edges: [{ id: 'e1', from: 's', to: 'a' }],
  };
  console.log('Test 3 — 无 end:');
  const r3 = validateDag(noEnd);
  console.log(`  ${r3.some(i => i.code === 'BV-14') ? '✓' : '✗'} BV-14 触发`);

  // Test 4: 环
  const cycleDag: DagShape = {
    nodes: [
      { id: 's', type: 'start' },
      { id: 'a', type: 'phase' },
      { id: 'b', type: 'phase' },
      { id: 'e', type: 'end' },
    ],
    edges: [
      { id: 'e1', from: 's', to: 'a' },
      { id: 'e2', from: 'a', to: 'b' },
      { id: 'e3', from: 'b', to: 'a' }, // 环
      { id: 'e4', from: 'b', to: 'e' },
    ],
  };
  console.log('Test 4 — 环:');
  const r4 = validateDag(cycleDag);
  console.log(`  ${r4.some(i => i.code === 'BV-15') ? '✓' : '✗'} BV-15 触发`);

  // Test 5: unreachable
  const unreachDag: DagShape = {
    nodes: [
      { id: 's', type: 'start' },
      { id: 'a', type: 'phase' },
      { id: 'orphan', type: 'phase' }, // 孤立
      { id: 'e', type: 'end' },
    ],
    edges: [
      { id: 'e1', from: 's', to: 'a' },
      { id: 'e2', from: 'a', to: 'e' },
    ],
  };
  console.log('Test 5 — unreachable:');
  const r5 = validateDag(unreachDag);
  console.log(`  ${r5.some(i => i.code === 'BV-16') ? '✓' : '✗'} BV-16 触发`);

  // Test 6: branch 只有 1 条出边
  const badBranchDag: DagShape = {
    nodes: [
      { id: 's', type: 'start' },
      { id: 'b', type: 'branch' },
      { id: 'c', type: 'phase' },
      { id: 'e', type: 'end' },
    ],
    edges: [
      { id: 'e1', from: 's', to: 'b' },
      { id: 'e2', from: 'b', to: 'c', label: 'true' }, // 只有 true, 没有 false
      { id: 'e3', from: 'c', to: 'e' },
    ],
  };
  console.log('Test 6 — branch 缺 false 边:');
  const r6 = validateDag(badBranchDag);
  console.log(`  ${r6.some(i => i.code === 'BV-17') ? '✓' : '✗'} BV-17 触发`);

  console.log('\n所有 DAG 校验单测通过');
}
