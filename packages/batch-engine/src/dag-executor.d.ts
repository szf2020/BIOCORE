export type DAGNodeType = 'start' | 'end' | 'phase' | 'branch';
export interface DAGNodeBase {
    id: string;
    type: DAGNodeType;
}
export interface DAGStartNode extends DAGNodeBase {
    type: 'start';
}
export interface DAGEndNode extends DAGNodeBase {
    type: 'end';
}
export interface DAGPhaseNode extends DAGNodeBase {
    type: 'phase';
    phase_id: string;
    phase_type: string;
    params?: Record<string, any>;
}
export interface DAGBranchNode extends DAGNodeBase {
    type: 'branch';
    expression: string;
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
export declare class DAGExecutor {
    private dag;
    private currentNodeId;
    private visited;
    constructor(dag: RecipeDAG);
    /**
     * 初始化: 找到 start 节点并推进到第一个 phase 节点 (或 end)
     */
    start(ctx?: DAGEvalContext): void;
    /**
     * 推进到下一个节点。处理 branch (按表达式求值选边) 和 phase (取第一条出边)。
     * 返回 true 表示成功推进, false 表示已到 end 或无路径。
     */
    advance(ctx?: DAGEvalContext): boolean;
    /**
     * 从当前节点起推进到第一个 phase 或 end 节点。
     * 用于 start() 初始化时跳过 start 节点。
     */
    private advanceToPhaseOrEnd;
    /**
     * 当前节点是否是 phase 节点, 可以执行
     */
    hasCurrentPhase(): boolean;
    /**
     * 当前 phase (若非 phase 节点返回 null)
     */
    currentPhase(): {
        phase_id: string;
        phase_type: string;
        params: Record<string, any>;
        node_id: string;
    } | null;
    /**
     * 当前节点 (任意类型)
     */
    getCurrentNode(): DAGNode | null;
    /**
     * 从起点计算所有可能的 phase 节点 (忽略 branch 条件, 全部展开)。
     * 用于 batch-controller 初始化 phaseStatuses (显示配方 phase 总数)。
     */
    getAllPhases(): {
        phase_id: string;
        phase_type: string;
        params: Record<string, any>;
        node_id: string;
        index: number;
    }[];
    /**
     * 判断 DAG 是否完整遍历结束 (当前节点为 end 或 null)
     */
    isComplete(): boolean;
    /**
     * 重置到 start (重跑用)
     */
    reset(): void;
    private getNode;
}
//# sourceMappingURL=dag-executor.d.ts.map