import type { DOEFactor, OrthogonalDesign, OrthogonalAnovaResult } from './doe-types';
import type { ExperimentResult } from './doe-range-analysis';
/**
 * 正交试验方差分析
 *
 * 步骤:
 * 1. 计算总离差平方和 SS_T = Σ(yi - ȳ)²
 * 2. 计算各因素离差平方和 SS_A = r × Σ(k_Aj - ȳ)²
 * 3. 误差平方和 SS_E = SS_T - Σ(SS_因素)
 * 4. 若饱和设计 (无空列), 用合并法: 将最小SS的因素并入误差
 * 5. F检验: F_A = MS_A / MS_E
 *
 * @param design - 正交试验设计
 * @param results - 试验结果
 * @param factors - 因素定义
 * @param poolThreshold - 合并门槛: SS占比低于此值的因素自动并入误差 (默认0.1)
 */
export declare function orthogonalAnova(design: OrthogonalDesign, results: ExperimentResult[], factors: DOEFactor[], poolThreshold?: number): OrthogonalAnovaResult;
/** 含重复试验的结果 */
export interface ReplicatedResult {
    /** 运行序号 */
    runIndex: number;
    /** 多次测量值 */
    replicates: number[];
}
/**
 * 含重复试验的正交方差分析
 *
 * 重复试验可以独立估计试验误差 (纯误差),
 * 不需要合并法, 提供更可靠的F检验.
 *
 * SS_T = SS_因素们 + SS_纯误差
 * SS_纯误差 = Σ Σ (y_ij - ȳ_i)²  (各行内的重复偏差)
 */
export declare function orthogonalAnovaWithReplicates(design: OrthogonalDesign, results: ReplicatedResult[], factors: DOEFactor[]): OrthogonalAnovaResult;
//# sourceMappingURL=doe-anova.d.ts.map