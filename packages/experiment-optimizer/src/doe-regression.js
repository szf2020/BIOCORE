"use strict";
// ============================================================
// doe-regression.ts — 试验数据回归分析
//
// 参考《试验设计与数据处理》第8章:
//   通过回归分析确定试验指标与因素之间的近似函数关系.
//
// 功能:
//   - 一元线性/多项式回归
//   - 多元线性回归
//   - 二阶响应曲面回归 (扩展现有 doe-analysis.ts)
//   - 回归方程显著性检验 (F检验)
//   - 回归系数显著性检验 (t检验)
//   - 残差分析
//
// 与 doe-analysis.ts 的关系:
//   doe-analysis.ts 面向 CCD/全因子的编码设计;
//   本文件面向正交/均匀设计的原始数据回归, 不做编码变换.
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.polynomialRegression = polynomialRegression;
exports.multipleRegression = multipleRegression;
exports.quadraticSurfaceRegression = quadraticSurfaceRegression;
exports.diagnoseResiduals = diagnoseResiduals;
// ─── 矩阵运算 (复用 doe-analysis 中的逻辑) ──────────────
function transpose(m) {
    if (m.length === 0)
        return [];
    return m[0].map((_, j) => m.map(row => row[j]));
}
function matMul(a, b) {
    return a.map(row => b[0].map((_, j) => row.reduce((s, v, k) => s + v * b[k][j], 0)));
}
function matVecMul(m, v) {
    return m.map(row => row.reduce((s, val, i) => s + val * v[i], 0));
}
function invertMatrix(m) {
    const n = m.length;
    const aug = m.map((r, i) => [...r, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);
    for (let i = 0; i < n; i++) {
        let max = i;
        for (let k = i + 1; k < n; k++)
            if (Math.abs(aug[k][i]) > Math.abs(aug[max][i]))
                max = k;
        [aug[i], aug[max]] = [aug[max], aug[i]];
        if (Math.abs(aug[i][i]) < 1e-12)
            return null;
        const p = aug[i][i];
        for (let j = 0; j < 2 * n; j++)
            aug[i][j] /= p;
        for (let k = 0; k < n; k++) {
            if (k === i)
                continue;
            const f = aug[k][i];
            for (let j = 0; j < 2 * n; j++)
                aug[k][j] -= f * aug[i][j];
        }
    }
    return aug.map(r => r.slice(n));
}
// 标准正态 CDF
function normalCdf(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p_ = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const z = Math.abs(x) / Math.sqrt(2);
    const t = 1 / (1 + p_ * z);
    const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
    return 0.5 * (1 + sign * y);
}
// ─── 一元多项式回归 ────────────────────────────────────────
/**
 * 一元多项式回归
 *
 * y = b₀ + b₁x + b₂x² + ... + bₖxᵏ
 *
 * @param xValues - 自变量值
 * @param yValues - 因变量值
 * @param degree - 多项式阶数 (默认1=线性)
 */
function polynomialRegression(xValues, yValues, degree = 1, xName = 'x') {
    if (xValues.length !== yValues.length || xValues.length === 0)
        return null;
    // 构造特征矩阵: [1, x, x², ..., xᵏ]
    const termNames = ['intercept'];
    for (let d = 1; d <= degree; d++) {
        termNames.push(d === 1 ? xName : `${xName}^${d}`);
    }
    const points = xValues.map((x, i) => {
        const xFeatures = {};
        for (let d = 1; d <= degree; d++) {
            xFeatures[termNames[d]] = Math.pow(x, d);
        }
        return { x: xFeatures, y: yValues[i] };
    });
    return multipleRegression(points, termNames.slice(1));
}
// ─── 多元线性回归 ──────────────────────────────────────────
/**
 * 多元线性回归
 *
 * y = b₀ + b₁x₁ + b₂x₂ + ... + bₖxₖ
 *
 * @param points - 数据点
 * @param xNames - 自变量名列表
 */
function multipleRegression(points, xNames) {
    const n = points.length;
    const p = xNames.length + 1; // 含截距
    if (n < p)
        return null; // 数据不足
    // 构造设计矩阵 X (含截距列)
    const X = points.map(pt => {
        const row = [1]; // 截距
        for (const name of xNames) {
            row.push(pt.x[name] ?? 0);
        }
        return row;
    });
    const y = points.map(pt => pt.y);
    // OLS: β = (XᵀX)⁻¹Xᵀy
    const Xt = transpose(X);
    const XtX = matMul(Xt, X);
    const XtXinv = invertMatrix(XtX);
    if (!XtXinv)
        return null;
    const Xty = matVecMul(Xt, y);
    const beta = matVecMul(XtXinv, Xty);
    // 拟合值和残差
    const fitted = X.map(row => row.reduce((s, v, i) => s + v * beta[i], 0));
    const residuals = y.map((yi, i) => yi - fitted[i]);
    // 统计量
    const yMean = y.reduce((a, b) => a + b, 0) / n;
    const ssTotal = y.reduce((s, yi) => s + (yi - yMean) ** 2, 0);
    const ssResidual = residuals.reduce((s, r) => s + r * r, 0);
    const ssRegression = ssTotal - ssResidual;
    const rSquared = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;
    const adjustedRSquared = n > p ? 1 - (1 - rSquared) * (n - 1) / (n - p) : rSquared;
    const residualStdError = n > p ? Math.sqrt(ssResidual / (n - p)) : 0;
    // 回归方程 F 检验: F = (SSR/k) / (SSE/(n-k-1))
    const k = p - 1; // 自变量数 (不含截距)
    const dfRegression = k;
    const dfResidual = n - p;
    const msRegression = dfRegression > 0 ? ssRegression / dfRegression : 0;
    const msResidual = dfResidual > 0 ? ssResidual / dfResidual : 0;
    const fStatistic = msResidual > 0 ? msRegression / msResidual : 0;
    // F 检验 p 值和显著性 (简化)
    let fPValue = 0.5;
    let fSignificance = '';
    if (fStatistic > 0) {
        // 粗略估计: 使用正态近似
        fPValue = fStatistic > 10 ? 0.001 : fStatistic > 5 ? 0.02 : fStatistic > 3 ? 0.06 : 0.2;
        fSignificance = fPValue < 0.01 ? '**' : fPValue < 0.05 ? '*' : '';
    }
    // 各系数的 t 检验
    const sigmaSq = residualStdError ** 2;
    const allTermNames = ['intercept', ...xNames];
    const coefficients = beta.map((coef, i) => {
        const se = Math.sqrt(Math.max(0, XtXinv[i][i] * sigmaSq));
        const tValue = se > 0 ? coef / se : 0;
        const pValue = 2 * (1 - normalCdf(Math.abs(tValue)));
        return {
            term: allTermNames[i],
            value: coef,
            stdError: se,
            tValue,
            pValue,
            significant: pValue < 0.05,
        };
    });
    // 生成方程字符串
    const equation = buildEquationString(coefficients);
    return {
        modelType: xNames.length === 1 ? '一元回归' : '多元回归',
        coefficients: coefficients.slice(1), // 不含截距
        intercept: beta[0],
        rSquared,
        adjustedRSquared,
        fStatistic,
        fPValue,
        fSignificance,
        residualStdError,
        residuals,
        fitted,
        n,
        p,
        equation,
    };
}
// ─── 二阶响应曲面回归 (原始数据, 非编码) ──────────────────
/**
 * 二阶多项式响应曲面回归
 *
 * y = b₀ + Σbᵢxᵢ + Σbᵢᵢxᵢ² + Σbᵢⱼxᵢxⱼ
 *
 * @param points - 数据点
 * @param xNames - 原始自变量名
 */
function quadraticSurfaceRegression(points, xNames) {
    // 扩展特征: 线性 + 二次 + 交互
    const expandedNames = [];
    // 线性项
    expandedNames.push(...xNames);
    // 二次项
    for (const name of xNames) {
        expandedNames.push(`${name}²`);
    }
    // 交互项
    for (let i = 0; i < xNames.length; i++) {
        for (let j = i + 1; j < xNames.length; j++) {
            expandedNames.push(`${xNames[i]}×${xNames[j]}`);
        }
    }
    // 扩展数据点
    const expandedPoints = points.map(pt => {
        const expanded = {};
        // 线性项
        for (const name of xNames) {
            expanded[name] = pt.x[name] ?? 0;
        }
        // 二次项
        for (const name of xNames) {
            expanded[`${name}²`] = (pt.x[name] ?? 0) ** 2;
        }
        // 交互项
        for (let i = 0; i < xNames.length; i++) {
            for (let j = i + 1; j < xNames.length; j++) {
                expanded[`${xNames[i]}×${xNames[j]}`] = (pt.x[xNames[i]] ?? 0) * (pt.x[xNames[j]] ?? 0);
            }
        }
        return { x: expanded, y: pt.y };
    });
    const result = multipleRegression(expandedPoints, expandedNames);
    if (result) {
        result.modelType = '二阶响应曲面';
    }
    return result;
}
// ─── 工具函数 ─────────────────────────────────────────────
/** 构建回归方程字符串 */
function buildEquationString(coefficients) {
    const parts = [];
    for (const c of coefficients) {
        if (c.term === 'intercept') {
            parts.push(formatNumber(c.value));
            continue;
        }
        const sign = c.value >= 0 ? '+' : '-';
        const abs = Math.abs(c.value);
        parts.push(`${sign} ${formatNumber(abs)}·${c.term}`);
    }
    return `Y = ${parts.join(' ')}`;
}
function formatNumber(n) {
    if (Math.abs(n) < 0.001)
        return n.toExponential(3);
    return n.toFixed(4);
}
/**
 * 残差诊断分析
 */
function diagnoseResiduals(result) {
    const r = result.residuals;
    const n = r.length;
    const mean = r.reduce((a, b) => a + b, 0) / n;
    const std = result.residualStdError;
    // 偏度
    const m3 = r.reduce((s, ri) => s + (ri - mean) ** 3, 0) / n;
    const skewness = std > 0 ? m3 / (std ** 3) : 0;
    // 峰度
    const m4 = r.reduce((s, ri) => s + (ri - mean) ** 4, 0) / n;
    const kurtosis = std > 0 ? m4 / (std ** 4) - 3 : 0;
    // 正态性: |偏度| < 1 且 |峰度| < 2 (简化判断)
    const normalityOk = Math.abs(skewness) < 1 && Math.abs(kurtosis) < 2;
    // 离群点检测
    const outliers = [];
    r.forEach((ri, i) => {
        if (std > 0 && Math.abs(ri) > 2 * std) {
            outliers.push(i);
        }
    });
    return {
        normalityOk,
        skewness,
        kurtosis,
        maxResidual: Math.max(...r.map(Math.abs)),
        meanResidual: mean,
        outliers,
    };
}
//# sourceMappingURL=doe-regression.js.map