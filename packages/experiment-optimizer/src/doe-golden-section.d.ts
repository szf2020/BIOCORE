import type { GoldenSectionState, OptimizationGoal } from './doe-types';
/**
 * 创建黄金分割搜索状态
 *
 * @param factorName - 因素名称
 * @param min - 搜索区间下界
 * @param max - 搜索区间上界
 * @param goal - 优化方向
 */
export declare function createGoldenSearch(factorName: string, min: number, max: number, goal?: OptimizationGoal): GoldenSectionState;
/**
 * 提交试验结果并获取下一个试验点
 *
 * @param state - 当前搜索状态
 * @param x - 刚完成的试验点
 * @param y - 对应的响应值
 * @param goal - 优化方向
 * @param tolerance - 收敛容差 (区间长度 / 初始区间长度 < tolerance 时停止)
 * @param maxIterations - 最大迭代次数
 * @returns 更新后的状态 (包含下一个试验点或收敛标记)
 */
export declare function advanceGoldenSearch(state: GoldenSectionState, x: number, y: number, goal?: OptimizationGoal, tolerance?: number, maxIterations?: number): GoldenSectionState;
/**
 * Fibonacci 搜索法 — 预先确定试验次数
 *
 * 与黄金分割法相似, 但用 Fibonacci 比代替黄金比,
 * 在已知总试验次数时, 每次缩短区间的效率略优于黄金分割.
 *
 * @param factorName - 因素名称
 * @param min - 区间下界
 * @param max - 区间上界
 * @param totalTrials - 总试验次数 (包含区间两端)
 * @returns 全部试验点 (按顺序排列)
 */
export declare function fibonacciSearchPoints(factorName: string, min: number, max: number, totalTrials: number): number[];
/** 多因素黄金分割搜索状态 */
export interface MultiFactorSearchState {
    /** 各因素的搜索状态 */
    factors: Record<string, GoldenSectionState>;
    /** 当前正在搜索的因素名 */
    currentFactor: string | null;
    /** 因素搜索顺序 */
    factorOrder: string[];
    /** 当前因素索引 */
    currentIndex: number;
    /** 是否全部完成 */
    completed: boolean;
}
/**
 * 创建多因素独立黄金分割搜索
 *
 * 按顺序对每个因素独立搜索:
 *   搜索因素A (其他固定) → 找到A最优 →
 *   搜索因素B (A固定在最优, 其他固定) → ...
 *
 * @param factorRanges - 各因素的搜索范围
 * @param goal - 优化方向
 */
export declare function createMultiFactorSearch(factorRanges: {
    name: string;
    min: number;
    max: number;
}[], goal?: OptimizationGoal): MultiFactorSearchState;
/**
 * 推进多因素搜索
 *
 * @returns 更新后的状态, currentFactor 指示当前搜索的因素
 */
export declare function advanceMultiFactorSearch(state: MultiFactorSearchState, x: number, y: number, goal?: OptimizationGoal): MultiFactorSearchState;
//# sourceMappingURL=doe-golden-section.d.ts.map