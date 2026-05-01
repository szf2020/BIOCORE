export interface DoEFactor {
    name: string;
    path: string;
    min: number;
    max: number;
    levels?: number;
    center?: number;
}
export interface DesignMatrixRow {
    /** 1-based 运行序号 */
    run_index: number;
    /** 因子值 { factor_name: value } */
    factor_values: Record<string, number>;
    /** 点类型标签 (仅 ccd 有意义) */
    point_type?: 'factorial' | 'axial' | 'center';
}
export type DesignType = 'full_factorial' | 'fractional_factorial' | 'ccd' | 'latin_hypercube' | 'plackett_burman' | 'box_behnken' | 'definitive_screening';
/**
 * 全因子设计. k 个因子, 每个 levels 水平 → 生成 levels^k 个点.
 * levels=2 时用 min/max, levels=3 时加中心点, >3 时等距分割.
 */
export declare function generateFullFactorial(factors: DoEFactor[]): DesignMatrixRow[];
/**
 * 中心复合设计 = factorial 2^k + 2k 个 axial + N 个 center (默认 3 个中心).
 * alpha 默认为 k^0.25 (旋转可设计 rotatable CCD).
 * 只适合 k<=5, 点数 = 2^k + 2k + centerReps.
 */
export declare function generateCCD(factors: DoEFactor[], opts?: {
    centerReps?: number;
    alpha?: number;
}): DesignMatrixRow[];
/**
 * 拉丁超立方空间填充. n 行, 每个因子区间分 n 段, 随机排列 → 每段只采一次.
 * 适合 k>4 或贝叶斯先验.
 */
export declare function generateLatinHypercube(factors: DoEFactor[], n: number): DesignMatrixRow[];
/**
 * Plackett-Burman 2水平筛选设计.
 * N 次试验可筛选 N-1 个因素 (N=4,8,12,16,20,24...).
 * 使用 Hadamard 矩阵行移位法构造.
 */
export declare function generatePlackettBurman(factors: DoEFactor[]): DesignMatrixRow[];
/**
 * Box-Behnken 3水平响应面设计.
 * 比 CCD 需要更少试验点, 不含极端角点.
 * 只适合 k=3~7 个因素.
 */
export declare function generateBoxBehnken(factors: DoEFactor[], centerReps?: number): DesignMatrixRow[];
/**
 * 2水平分数因子设计 2^(k-p)
 * @param factors - 因素列表 (只用 min/max)
 * @param p - 分数程度 (省略则自动选最高分辨率)
 */
export declare function generateFractionalFactorial(factors: DoEFactor[], p?: number): DesignMatrixRow[];
/**
 * Definitive Screening Design (DSD)
 * N = 2k+1 次试验筛选 k 个连续因素, 能检测主效应 + 二次效应
 * 每列只有 3 个不同水平 (-1, 0, +1), 正交于所有主效应
 */
export declare function generateDefinitiveScreening(factors: DoEFactor[]): DesignMatrixRow[];
export declare function generateDesignMatrix(type: DesignType, factors: DoEFactor[], opts?: {
    n?: number;
    centerReps?: number;
    alpha?: number;
}): DesignMatrixRow[];
//# sourceMappingURL=doe-designs.d.ts.map