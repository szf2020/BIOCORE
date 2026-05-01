"use strict";
// ============================================================
// doe-diagnostics.ts — DOE 设计质量诊断 (参考 OApackage)
//
// 提供设计矩阵的质量评估指标:
//   - D-efficiency: 设计的信息量
//   - 条件数: 多重共线性检测
//   - 相关矩阵: 列间相关系数
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateDesign = evaluateDesign;
/**
 * 评估设计矩阵质量
 *
 * @param factorNames - 因素名列表
 * @param runs - 运行列表 [{ factorValues: { name: value } }]
 */
function evaluateDesign(factorNames, runs) {
    const n = runs.length;
    const k = factorNames.length;
    if (n === 0 || k === 0) {
        return {
            n, k, dEfficiency: null, conditionNumber: Infinity,
            correlationMatrix: { factors: factorNames, matrix: [] },
            maxCorrelation: 0, balanceScore: 0,
        };
    }
    // 构造设计矩阵 X (n × k, 编码到 [-1, 1])
    const X = buildCodedMatrix(factorNames, runs);
    // 相关矩阵
    const corrMatrix = correlationMatrix(X, factorNames);
    // 最大非对角相关系数
    let maxCorr = 0;
    for (let i = 0; i < k; i++) {
        for (let j = i + 1; j < k; j++) {
            maxCorr = Math.max(maxCorr, Math.abs(corrMatrix.matrix[i][j]));
        }
    }
    // X'X 矩阵 (含截距列)
    const Xa = X.map(row => [1, ...row]); // 增广矩阵
    const XtX = matMul(transpose(Xa), Xa);
    // D-efficiency: (det(X'X))^(1/p) / n
    const p = k + 1; // 含截距
    const det = matDet(XtX);
    const dEff = det > 0 ? Math.pow(det, 1 / p) / n : null;
    // 条件数: sqrt(最大特征值 / 最小特征值) 近似
    const condNum = estimateConditionNumber(XtX);
    // 平衡性: 每列值出现频率的均匀度
    const balance = calculateBalance(X, factorNames, runs);
    return {
        n, k,
        dEfficiency: dEff !== null ? round(dEff, 4) : null,
        conditionNumber: round(condNum, 2),
        correlationMatrix: corrMatrix,
        maxCorrelation: round(maxCorr, 4),
        balanceScore: round(balance, 4),
    };
}
// ─── 矩阵工具函数 ────────────────────────────────────────
function buildCodedMatrix(factorNames, runs) {
    // 先算每列的 min/max
    const ranges = factorNames.map(name => {
        const vals = runs.map(r => r.factor_values[name] ?? 0);
        return { min: Math.min(...vals), max: Math.max(...vals) };
    });
    // 编码到 [-1, 1]
    return runs.map(r => factorNames.map((name, j) => {
        const v = r.factor_values[name] ?? 0;
        const { min, max } = ranges[j];
        const mid = (min + max) / 2;
        const half = (max - min) / 2;
        return half === 0 ? 0 : (v - mid) / half;
    }));
}
function correlationMatrix(X, factorNames) {
    const k = factorNames.length;
    const n = X.length;
    // 列均值
    const means = Array.from({ length: k }, (_, j) => X.reduce((s, row) => s + row[j], 0) / n);
    // 列标准差
    const stds = Array.from({ length: k }, (_, j) => {
        const m = means[j];
        return Math.sqrt(X.reduce((s, row) => s + (row[j] - m) ** 2, 0) / (n - 1));
    });
    // 相关系数矩阵
    const matrix = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => {
        if (i === j)
            return 1;
        if (stds[i] === 0 || stds[j] === 0)
            return 0;
        const cov = X.reduce((s, row) => s + (row[i] - means[i]) * (row[j] - means[j]), 0) / (n - 1);
        return round(cov / (stds[i] * stds[j]), 4);
    }));
    return { factors: factorNames, matrix };
}
function transpose(m) {
    if (m.length === 0)
        return [];
    return m[0].map((_, j) => m.map(row => row[j]));
}
function matMul(a, b) {
    return a.map(row => b[0].map((_, j) => row.reduce((s, v, k) => s + v * b[k][j], 0)));
}
/** 行列式 (LU 分解) */
function matDet(m) {
    const n = m.length;
    const a = m.map(r => [...r]);
    let det = 1;
    for (let i = 0; i < n; i++) {
        let maxRow = i;
        for (let k = i + 1; k < n; k++) {
            if (Math.abs(a[k][i]) > Math.abs(a[maxRow][i]))
                maxRow = k;
        }
        if (maxRow !== i) {
            [a[i], a[maxRow]] = [a[maxRow], a[i]];
            det *= -1;
        }
        if (Math.abs(a[i][i]) < 1e-12)
            return 0;
        det *= a[i][i];
        for (let k = i + 1; k < n; k++) {
            const f = a[k][i] / a[i][i];
            for (let j = i; j < n; j++)
                a[k][j] -= f * a[i][j];
        }
    }
    return det;
}
/** 条件数估计 (幂迭代法求最大/最小特征值比) */
function estimateConditionNumber(XtX) {
    const n = XtX.length;
    if (n === 0)
        return 1;
    // 简化: 用对角线元素比值近似
    const diag = XtX.map((row, i) => row[i]);
    const maxD = Math.max(...diag);
    const minD = Math.min(...diag.filter(d => d > 1e-10));
    return minD > 0 ? Math.sqrt(maxD / minD) : Infinity;
}
function calculateBalance(X, factorNames, runs) {
    // 对每列统计唯一值的出现频率, 计算频率的 CV
    let totalCV = 0;
    for (let j = 0; j < factorNames.length; j++) {
        const vals = runs.map(r => r.factor_values[factorNames[j]] ?? 0);
        const unique = [...new Set(vals)];
        const counts = unique.map(u => vals.filter(v => v === u).length);
        const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
        const std = Math.sqrt(counts.reduce((s, c) => s + (c - mean) ** 2, 0) / counts.length);
        totalCV += mean > 0 ? std / mean : 0;
    }
    return totalCV / factorNames.length;
}
function round(v, d) {
    const f = 10 ** d;
    return Math.round(v * f) / f;
}
//# sourceMappingURL=doe-diagnostics.js.map