/** 设计诊断结果 */
export interface DesignDiagnostics {
    /** 设计点数 */
    n: number;
    /** 因素数 */
    k: number;
    /** D-efficiency (0-1, 越大越好) */
    dEfficiency: number | null;
    /** 条件数 (越接近 1 越好, >30 预警) */
    conditionNumber: number;
    /** 列间相关系数矩阵 (对角线为 1) */
    correlationMatrix: {
        factors: string[];
        matrix: number[][];
    };
    /** 最大列间相关系数 (理想值 0) */
    maxCorrelation: number;
    /** 设计平衡性 (每个因素水平出现频率的标准差, 0 为完美平衡) */
    balanceScore: number;
}
/**
 * 评估设计矩阵质量
 *
 * @param factorNames - 因素名列表
 * @param runs - 运行列表 [{ factorValues: { name: value } }]
 */
export declare function evaluateDesign(factorNames: string[], runs: {
    factor_values: Record<string, number>;
}[]): DesignDiagnostics;
//# sourceMappingURL=doe-diagnostics.d.ts.map