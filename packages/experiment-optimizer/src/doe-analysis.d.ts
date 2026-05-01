import type { DoEFactor } from './doe-designs';
export type ModelType = 'linear' | 'interaction' | 'quadratic';
export interface TermCoefficient {
    term: string;
    coefficient: number;
    std_error?: number;
    t_statistic?: number;
    p_value?: number;
    significant?: boolean;
}
export interface ModelFitResult {
    type: ModelType;
    factorNames: string[];
    terms: TermCoefficient[];
    intercept: number;
    r_squared: number;
    adjusted_r_squared: number;
    residual_std_error: number;
    n_observations: number;
    n_terms: number;
    residuals: number[];
    fitted: number[];
}
export interface ObservationPoint {
    factor_values: Record<string, number>;
    response: number;
}
/**
 * 给定因子名和模型类型, 生成特征矩阵的列头 (用于展示系数表时)
 */
export declare function buildTermList(factorNames: string[], type: ModelType): string[];
export declare function fitResponseModel(points: ObservationPoint[], factors: DoEFactor[], type?: ModelType): ModelFitResult | null;
export interface OptimumResult {
    optimum_factor_values: Record<string, number>;
    predicted_response: number;
    goal: 'max' | 'min';
}
/**
 * 在因子边界内网格搜索最优点.
 * 对每个因子取 grid 个点, 总候选 = grid^k.
 */
export declare function findOptimum(model: ModelFitResult, factors: DoEFactor[], goal?: 'max' | 'min', grid?: number): OptimumResult;
export interface ParetoEntry {
    term: string;
    abs_coefficient: number;
    significant: boolean;
}
export declare function paretoChart(model: ModelFitResult): ParetoEntry[];
//# sourceMappingURL=doe-analysis.d.ts.map