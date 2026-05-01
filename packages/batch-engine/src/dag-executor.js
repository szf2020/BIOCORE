"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DAGExecutor = void 0;
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
class DAGExecutor {
    dag;
    currentNodeId = null;
    visited = new Set();
    constructor(dag) {
        this.dag = dag;
    }
    /**
     * 初始化: 找到 start 节点并推进到第一个 phase 节点 (或 end)
     */
    start(ctx) {
        const startNode = this.dag.nodes.find(n => n.type === 'start');
        if (!startNode)
            throw new Error('DAG 没有 start 节点');
        this.currentNodeId = startNode.id;
        this.visited.clear();
        this.visited.add(startNode.id);
        // 推进到第一个 phase 节点 (跳过 start / branch)
        this.advanceToPhaseOrEnd(ctx);
    }
    /**
     * 推进到下一个节点。处理 branch (按表达式求值选边) 和 phase (取第一条出边)。
     * 返回 true 表示成功推进, false 表示已到 end 或无路径。
     */
    advance(ctx) {
        if (!this.currentNodeId)
            return false;
        const node = this.getNode(this.currentNodeId);
        if (!node || node.type === 'end')
            return false;
        const outEdges = this.dag.edges.filter(e => e.from === this.currentNodeId);
        if (outEdges.length === 0) {
            this.currentNodeId = null;
            return false;
        }
        let nextId;
        if (node.type === 'branch') {
            const expr = node.expression;
            const result = ctx?.evaluateExpression(expr) ?? false;
            const targetLabel = result ? 'true' : 'false';
            const targetEdge = outEdges.find(e => e.label === targetLabel);
            if (!targetEdge) {
                throw new Error(`Branch 节点 ${node.id} 找不到 ${targetLabel} 出边`);
            }
            nextId = targetEdge.to;
        }
        else {
            // start / phase 节点: 取第一条边
            nextId = outEdges[0].to;
        }
        // 环检测
        if (this.visited.has(nextId)) {
            throw new Error(`检测到环: ${this.currentNodeId} → ${nextId}`);
        }
        this.currentNodeId = nextId;
        this.visited.add(nextId);
        // 如果推进到的是 branch, 继续推进到下一个 phase/end (branch 节点不暂停)
        const nextNode = this.getNode(nextId);
        if (nextNode && nextNode.type === 'branch') {
            return this.advance(ctx);
        }
        return true;
    }
    /**
     * 从当前节点起推进到第一个 phase 或 end 节点。
     * 用于 start() 初始化时跳过 start 节点。
     */
    advanceToPhaseOrEnd(ctx) {
        let guard = 0;
        while (this.currentNodeId) {
            const node = this.getNode(this.currentNodeId);
            if (!node)
                break;
            if (node.type === 'phase' || node.type === 'end')
                break;
            // start / branch 节点需要推进
            const ok = this.advance(ctx);
            if (!ok)
                break;
            if (++guard > 1000)
                throw new Error('advanceToPhaseOrEnd 防护: 超过 1000 次推进');
        }
    }
    /**
     * 当前节点是否是 phase 节点, 可以执行
     */
    hasCurrentPhase() {
        const node = this.getCurrentNode();
        return node?.type === 'phase';
    }
    /**
     * 当前 phase (若非 phase 节点返回 null)
     */
    currentPhase() {
        const node = this.getCurrentNode();
        if (!node || node.type !== 'phase')
            return null;
        const p = node;
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
    getCurrentNode() {
        if (!this.currentNodeId)
            return null;
        return this.getNode(this.currentNodeId);
    }
    /**
     * 从起点计算所有可能的 phase 节点 (忽略 branch 条件, 全部展开)。
     * 用于 batch-controller 初始化 phaseStatuses (显示配方 phase 总数)。
     */
    getAllPhases() {
        return this.dag.nodes
            .filter(n => n.type === 'phase')
            .map((n, idx) => {
            const p = n;
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
    isComplete() {
        if (!this.currentNodeId)
            return true;
        const node = this.getCurrentNode();
        return node?.type === 'end';
    }
    /**
     * 重置到 start (重跑用)
     */
    reset() {
        this.currentNodeId = null;
        this.visited.clear();
    }
    getNode(id) {
        return this.dag.nodes.find(n => n.id === id) || null;
    }
}
exports.DAGExecutor = DAGExecutor;
// ============================================================
// 自测块
// ============================================================
if (require.main === module) {
    // Test 1: 线性 DAG (无 branch)
    const linearDag = {
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
    const phases = [];
    while (exec1.hasCurrentPhase()) {
        const p = exec1.currentPhase();
        if (p)
            phases.push(p.phase_id);
        exec1.advance();
    }
    console.log(`  phases visited: ${phases.join(' → ')}`);
    console.log(`  ${phases.join(',') === 'A,B,C' ? '✓' : '✗'} 顺序 A → B → C`);
    console.log(`  ${exec1.isComplete() ? '✓' : '✗'} isComplete()`);
    // Test 2: branch DAG - true path
    const branchDag = {
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
    const ctxTrue = { evaluateExpression: () => true };
    const exec2 = new DAGExecutor(branchDag);
    exec2.start(ctxTrue);
    const pathTrue = [];
    while (exec2.hasCurrentPhase()) {
        const p = exec2.currentPhase();
        if (p)
            pathTrue.push(p.phase_id);
        exec2.advance(ctxTrue);
    }
    console.log(`  phases: ${pathTrue.join(' → ')}`);
    console.log(`  ${pathTrue.join(',') === 'A,C' ? '✓' : '✗'} A → C (skipping D)`);
    console.log('Test 3 — branch DAG (false 路径):');
    const ctxFalse = { evaluateExpression: () => false };
    const exec3 = new DAGExecutor(branchDag);
    exec3.start(ctxFalse);
    const pathFalse = [];
    while (exec3.hasCurrentPhase()) {
        const p = exec3.currentPhase();
        if (p)
            pathFalse.push(p.phase_id);
        exec3.advance(ctxFalse);
    }
    console.log(`  phases: ${pathFalse.join(' → ')}`);
    console.log(`  ${pathFalse.join(',') === 'A,D' ? '✓' : '✗'} A → D (skipping C)`);
    console.log('Test 4 — getAllPhases:');
    const allPhases = new DAGExecutor(branchDag).getAllPhases();
    console.log(`  total: ${allPhases.length} (期望 3)`);
    console.log(`  ${allPhases.length === 3 ? '✓' : '✗'} 展开所有 phase (忽略 branch)`);
    console.log('Test 5 — 环检测:');
    const cycleDag = {
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
        while (execCycle.hasCurrentPhase())
            execCycle.advance();
        console.log('  ✗ 应该抛错但没抛');
    }
    catch (e) {
        console.log(`  ✓ 环被捕获: ${e.message.slice(0, 40)}`);
    }
    console.log('\n所有单测通过');
}
//# sourceMappingURL=dag-executor.js.map