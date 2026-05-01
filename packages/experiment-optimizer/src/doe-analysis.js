"use strict";
// ============================================================
// doe-analysis.ts — 响应面模型拟合 + ANOVA + 最优点搜索
//
// 拟合模型: y = β0 + Σβi*Xi + Σβij*Xi*Xj + Σβii*Xi²
//   - main:         单因子线性项
//   - interaction:  两两交互项
//   - quadratic:    纯二次项 (用于 RSM)
//
// 支持 3 种模型:
//   - 'linear'     : 只有主效应 (适合筛选 / PB / 2-level factorial)
//   - 'interaction': 主效应 + 2 阶交互 (适合 2-level 的全因子/分数因子)
//   - 'quadratic'  : 主效应 + 交互 + 纯二次 (RSM, 需 CCD / Box-Behnken)
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTermList = buildTermList;
exports.fitResponseModel = fitResponseModel;
exports.findOptimum = findOptimum;
exports.paretoChart = paretoChart;
// ─── 设计矩阵构造 ────────────────────────────────────────────
/**
 * 给定因子名和模型类型, 生成特征矩阵的列头 (用于展示系数表时)
 */
function buildTermList(factorNames, type) {
    const main = factorNames.map(n => n);
    if (type === 'linear')
        return main;
    const interactions = [];
    for (let i = 0; i < factorNames.length; i++) {
        for (let j = i + 1; j < factorNames.length; j++) {
            interactions.push(`${factorNames[i]}:${factorNames[j]}`);
        }
    }
    if (type === 'interaction')
        return [...main, ...interactions];
    const quad = factorNames.map(n => `${n}^2`);
    return [...main, ...interactions, ...quad];
}
/**
 * 编码因子到 [-1, 1] (基于 factor.min/max)
 */
function codedVector(factor_values, factors) {
    return factors.map(f => {
        const v = factor_values[f.name];
        if (v === undefined)
            return 0;
        const mid = (f.min + f.max) / 2;
        const half = (f.max - f.min) / 2;
        return half === 0 ? 0 : (v - mid) / half;
    });
}
/**
 * 从编码因子向量扩展到设计矩阵行 (含主效应/交互/二次)
 */
function expandFeatures(coded, type) {
    const row = [1, ...coded]; // intercept + main
    if (type === 'linear')
        return row;
    // interactions
    for (let i = 0; i < coded.length; i++) {
        for (let j = i + 1; j < coded.length; j++) {
            row.push(coded[i] * coded[j]);
        }
    }
    if (type === 'interaction')
        return row;
    // quadratic
    for (let i = 0; i < coded.length; i++) {
        row.push(coded[i] * coded[i]);
    }
    return row;
}
// ─── OLS 核心 ────────────────────────────────────────────────
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
// ─── 拟合 ────────────────────────────────────────────────────
function fitResponseModel(points, factors, type = 'quadratic') {
    if (points.length === 0 || factors.length === 0)
        return null;
    // 构造 X (n × p), y (n)
    const X = points.map(p => expandFeatures(codedVector(p.factor_values, factors), type));
    const y = points.map(p => p.response);
    const n = X.length;
    const p = X[0].length;
    if (n < p) {
        // 数据不足, 自动降级到 linear
        if (type !== 'linear') {
            return fitResponseModel(points, factors, 'linear');
        }
        return null;
    }
    // β̂ = (XᵀX)⁻¹ Xᵀy
    const Xt = transpose(X);
    const XtX = matMul(Xt, X);
    const XtXinv = invertMatrix(XtX);
    if (!XtXinv)
        return null;
    const Xty = matVecMul(Xt, y);
    const beta = matVecMul(XtXinv, Xty);
    // 预测 + 残差
    const fitted = X.map(row => row.reduce((s, v, i) => s + v * beta[i], 0));
    const residuals = y.map((yi, i) => yi - fitted[i]);
    const yMean = y.reduce((a, b) => a + b, 0) / n;
    const ssTot = y.reduce((s, yi) => s + (yi - yMean) ** 2, 0);
    const ssRes = residuals.reduce((s, r) => s + r * r, 0);
    const r_squared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    // Adjusted R² = 1 - (1-R²) * (n-1) / (n-p)
    const adjusted_r_squared = n > p ? 1 - (1 - r_squared) * (n - 1) / (n - p) : r_squared;
    const residual_std_error = n > p ? Math.sqrt(ssRes / (n - p)) : 0;
    // 标准误差 + t 统计量 + p 值 (简化版, 用正态分布近似代替 t 分布)
    const termNames = ['intercept', ...buildTermList(factors.map(f => f.name), type)];
    const sigmaSq = residual_std_error ** 2;
    const terms = beta.map((coef, i) => {
        const se = Math.sqrt(Math.max(0, XtXinv[i][i] * sigmaSq));
        const t = se > 0 ? coef / se : 0;
        // 近似 p 值 (双尾正态): P(|Z| > |t|) ≈ 2 * (1 - Φ(|t|))
        const p_value = 2 * (1 - normalCdf(Math.abs(t)));
        return {
            term: termNames[i],
            coefficient: coef,
            std_error: se,
            t_statistic: t,
            p_value,
            significant: p_value < 0.05,
        };
    });
    return {
        type,
        factorNames: factors.map(f => f.name),
        terms: terms.slice(1), // 拆出 intercept
        intercept: beta[0],
        r_squared,
        adjusted_r_squared,
        residual_std_error,
        n_observations: n,
        n_terms: p,
        residuals,
        fitted,
    };
}
// 标准正态 CDF (Abramowitz & Stegun 近似)
function normalCdf(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p_ = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const z = Math.abs(x) / Math.sqrt(2);
    const t = 1 / (1 + p_ * z);
    const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
    return 0.5 * (1 + sign * y);
}
/**
 * 在因子边界内网格搜索最优点.
 * 对每个因子取 grid 个点, 总候选 = grid^k.
 */
function findOptimum(model, factors, goal = 'max', grid = 11) {
    const k = factors.length;
    const gridPoints = factors.map(f => {
        const step = (f.max - f.min) / (grid - 1);
        return Array.from({ length: grid }, (_, i) => f.min + step * i);
    });
    // 递归笛卡尔积 (k 维, grid^k 点)
    let best = null;
    const iterate = (depth, current) => {
        if (depth === k) {
            const coded = codedVector(current, factors);
            const features = expandFeatures(coded, model.type);
            let pred = 0;
            // features = [1, ...coded, ...interactions, ...quad]
            // beta = [intercept, ...terms]
            const allBeta = [model.intercept, ...model.terms.map(t => t.coefficient)];
            for (let i = 0; i < features.length && i < allBeta.length; i++)
                pred += features[i] * allBeta[i];
            if (!best ||
                (goal === 'max' && pred > best.pred) ||
                (goal === 'min' && pred < best.pred)) {
                best = { vals: { ...current }, pred };
            }
            return;
        }
        for (const v of gridPoints[depth]) {
            current[factors[depth].name] = v;
            iterate(depth + 1, current);
        }
    };
    iterate(0, {});
    return {
        optimum_factor_values: best ? best.vals : {},
        predicted_response: best ? best.pred : 0,
        goal,
    };
}
function paretoChart(model) {
    return model.terms
        .map(t => ({
        term: t.term,
        abs_coefficient: Math.abs(t.coefficient),
        significant: !!t.significant,
    }))
        .sort((a, b) => b.abs_coefficient - a.abs_coefficient);
}
//# sourceMappingURL=doe-analysis.js.map