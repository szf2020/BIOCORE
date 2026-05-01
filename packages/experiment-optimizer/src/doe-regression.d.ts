/** 回归数据点 */
export interface RegressionPoint {
    /** 自变量值 { x1: v1, x2: v2, ... } */
    x: Record<string, number>;
    /** 因变量值 */
    y: number;
}
/** 回归模型结果 */
export interface RegressionResult {
    /** 模型类型描述 */
    modelType: string;
    /** 回归系数 (含截距) */
    coefficients: {
        term: string;
        value: number;
        stdError: number;
        tValue: number;
        pValue: number;
        significant: boolean;
    }[];
    /** 截距 */
    intercept: number;
    /** 决定系数 R² */
    rSquared: number;
    /** 调整 R² */
    adjustedRSquared: number;
    /** 回归方程的 F 统计量 */
    fStatistic: number;
    /** F 检验 p 值 */
    fPValue: number;
    /** 回归方程显著性 */
    fSignificance: '**' | '*' | '';
    /** 残差标准误 */
    residualStdError: number;
    /** 残差 */
    residuals: number[];
    /** 拟合值 */
    fitted: number[];
    /** 观测数 */
    n: number;
    /** 自变量数 (含截距) */
    p: number;
    /** 回归方程字符串 */
    equation: string;
}
/**
 * 一元多项式回归
 *
 * y = b₀ + b₁x + b₂x² + ... + bₖxᵏ
 *
 * @param xValues - 自变量值
 * @param yValues - 因变量值
 * @param degree - 多项式阶数 (默认1=线性)
 */
export declare function polynomialRegression(xValues: number[], yValues: number[], degree?: number, xName?: string): RegressionResult | null;
/**
 * 多元线性回归
 *
 * y = b₀ + b₁x₁ + b₂x₂ + ... + bₖxₖ
 *
 * @param points - 数据点
 * @param xNames - 自变量名列表
 */
export declare function multipleRegression(points: RegressionPoint[], xNames: string[]): RegressionResult | null;
/**
 * 二阶多项式响应曲面回归
 *
 * y = b₀ + Σbᵢxᵢ + Σbᵢᵢxᵢ² + Σbᵢⱼxᵢxⱼ
 *
 * @param points - 数据点
 * @param xNames - 原始自变量名
 */
export declare function quadraticSurfaceRegression(points: RegressionPoint[], xNames: string[]): RegressionResult | null;
/** 残差诊断结果 */
export interface ResidualDiagnostics {
    /** 正态性检验 (Shapiro-Wilk 近似): true=近似正态 */
    normalityOk: boolean;
    /** 残差的偏度 */
    skewness: number;
    /** 残差的峰度 */
    kurtosis: number;
    /** 最大残差 (绝对值) */
    maxResidual: number;
    /** 平均残差 (应接近0) */
    meanResidual: number;
    /** 是否有离群点 (|残差| > 2σ) */
    outliers: number[];
}
/**
 * 残差诊断分析
 */
export declare function diagnoseResiduals(result: RegressionResult): ResidualDiagnostics;
//# sourceMappingURL=doe-regression.d.ts.map