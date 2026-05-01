import type { DOEFactor, OrthogonalDesign, RangeAnalysisResult, OptimizationGoal, IndicatorWeight, CompositeScore } from './doe-types';
/** 单次试验结果 */
export interface ExperimentResult {
    /** 运行序号 (1-based, 对应 OrthogonalRun.runIndex) */
    runIndex: number;
    /** 响应指标值 */
    response: number;
}
/** 多指标试验结果 */
export interface MultiIndicatorResult {
    runIndex: number;
    responses: Record<string, number>;
}
/**
 * 正交试验极差分析 (单指标)
 *
 * 对每个因素:
 * - K_j = 该因素第j水平下所有试验指标值之和
 * - k_j = K_j / r (r为该水平出现次数)
 * - R = max(k_j) - min(k_j) 极差
 *
 * @param design - 正交试验设计 (来自 generateOrthogonalDesign)
 * @param results - 各试验的响应值
 * @param factors - 因素定义
 * @param goal - 优化方向 ('maximize' 取最大k, 'minimize' 取最小k)
 */
export declare function rangeAnalysis(design: OrthogonalDesign, results: ExperimentResult[], factors: DOEFactor[], goal?: OptimizationGoal): RangeAnalysisResult;
/**
 * 多指标归一化综合评分
 *
 * 将各指标归一化到 [0, 1], 然后按权重加权求和.
 * 最大化指标: norm = (Y - Y_min) / (Y_max - Y_min)
 * 最小化指标: norm = (Y_max - Y) / (Y_max - Y_min)
 *
 * @param multiResults - 各试验的多指标结果
 * @param weights - 指标权重配置
 */
export declare function compositeScore(multiResults: MultiIndicatorResult[], weights: IndicatorWeight[]): CompositeScore[];
/**
 * 对多指标正交试验进行综合极差分析
 *
 * 先算综合评分, 再用综合评分做极差分析.
 */
export declare function multiIndicatorRangeAnalysis(design: OrthogonalDesign, multiResults: MultiIndicatorResult[], factors: DOEFactor[], weights: IndicatorWeight[]): RangeAnalysisResult;
/** 交互作用表格 */
export interface InteractionTable {
    factorA: string;
    factorB: string;
    /** 交互表: [levelA][levelB] → 平均响应 */
    means: number[][];
    /** 交互效应大小 (SS_AB 估计) */
    interactionEffect: number;
}
/**
 * 计算两个因素的交互作用表
 *
 * 在正交试验中, 若某两列有交互作用列,
 * 可以统计各水平组合的平均响应来判断交互效应.
 */
export declare function analyzeInteraction(design: OrthogonalDesign, results: ExperimentResult[], factorA: DOEFactor, factorB: DOEFactor): InteractionTable;
/** S/N 比类型 */
export type SNRatioType = 'larger_better' | 'smaller_better' | 'nominal_best';
/** S/N 比计算结果 */
export interface SNRatioResult {
    type: SNRatioType;
    typeLabel: string;
    /** 各试验的 S/N 比值 */
    snValues: {
        runIndex: number;
        sn: number;
    }[];
    /** 各因素各水平的 S/N 均值 (用于极差分析) */
    factorSN: {
        name: string;
        levels: number[];
        snMeans: number[];
        range: number;
        optimalLevel: number;
    }[];
    /** 因素按 S/N 极差排名 */
    ranking: string[];
}
/**
 * 田口 S/N 比分析 (替代极差分析中的原始响应值)
 *
 * @param design - 正交设计
 * @param results - 各试验结果 (支持重复: 一个 runIndex 多个值)
 * @param factors - 因素定义
 * @param type - S/N 类型
 */
export declare function snRatioAnalysis(design: OrthogonalDesign, results: {
    runIndex: number;
    values: number[];
}[], factors: DOEFactor[], type?: SNRatioType): SNRatioResult;
//# sourceMappingURL=doe-range-analysis.d.ts.map