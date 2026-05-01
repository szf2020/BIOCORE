"use strict";
// ============================================================
// doe-anova.ts — 正交试验方差分析
//
// 参考《试验设计与数据处理》第6章:
//   将试验总离差平方和分解为各因素的离差平方和与误差平方和,
//   通过F检验确定各因素对试验指标的影响是否显著.
//
// 支持:
//   - 等水平正交试验方差分析
//   - 饱和设计的合并法 (最小SS因素并入误差)
//   - 重复试验的方差分析
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.orthogonalAnova = orthogonalAnova;
exports.orthogonalAnovaWithReplicates = orthogonalAnovaWithReplicates;
// ─── F分布临界值表 (简化版) ────────────────────────────────
/**
 * F分布临界值查表 (α=0.05 和 α=0.01)
 * 键: `${df1}_${df2}`, 值: [F_0.05, F_0.01]
 *
 * 覆盖正交试验常见的自由度组合
 */
const F_TABLE = {
    // df1=1
    '1_1': [161.4, 4052], '1_2': [18.51, 98.50], '1_3': [10.13, 34.12],
    '1_4': [7.71, 21.20], '1_5': [6.61, 16.26], '1_6': [5.99, 13.75],
    '1_7': [5.59, 12.25], '1_8': [5.32, 11.26], '1_9': [5.12, 10.56],
    '1_10': [4.96, 10.04], '1_12': [4.75, 9.33], '1_15': [4.54, 8.68],
    '1_20': [4.35, 8.10], '1_30': [4.17, 7.56], '1_60': [4.00, 7.08],
    // df1=2
    '2_1': [199.5, 4999], '2_2': [19.00, 99.00], '2_3': [9.55, 30.82],
    '2_4': [6.94, 18.00], '2_5': [5.79, 13.27], '2_6': [5.14, 10.92],
    '2_7': [4.74, 9.55], '2_8': [4.46, 8.65], '2_9': [4.26, 8.02],
    '2_10': [4.10, 7.56], '2_12': [3.89, 6.93], '2_15': [3.68, 6.36],
    '2_20': [3.49, 5.85], '2_30': [3.32, 5.39], '2_60': [3.15, 4.98],
    // df1=3
    '3_2': [19.16, 99.17], '3_3': [9.28, 29.46], '3_4': [6.59, 16.69],
    '3_5': [5.41, 12.06], '3_6': [4.76, 9.78], '3_7': [4.35, 8.45],
    '3_8': [4.07, 7.59], '3_9': [3.86, 6.99], '3_10': [3.71, 6.55],
    '3_12': [3.49, 5.95], '3_15': [3.29, 5.42], '3_20': [3.10, 4.94],
    '3_30': [2.92, 4.51], '3_60': [2.76, 4.13],
    // df1=4
    '4_2': [19.25, 99.25], '4_3': [9.12, 28.71], '4_4': [6.39, 15.98],
    '4_5': [5.19, 11.39], '4_6': [4.53, 9.15], '4_7': [4.12, 7.85],
    '4_8': [3.84, 7.01], '4_9': [3.63, 6.42], '4_10': [3.48, 5.99],
    '4_12': [3.26, 5.41], '4_15': [3.06, 4.89], '4_20': [2.87, 4.43],
    '4_30': [2.69, 4.02], '4_60': [2.53, 3.65],
    // df1=6
    '6_2': [19.33, 99.33], '6_4': [6.16, 15.21], '6_6': [4.28, 8.47],
    '6_8': [3.58, 6.37], '6_10': [3.22, 5.39], '6_12': [3.00, 4.82],
    '6_20': [2.60, 3.87], '6_30': [2.42, 3.47],
    // df1=8
    '8_2': [19.37, 99.37], '8_4': [6.04, 14.80], '8_6': [4.15, 8.10],
    '8_8': [3.44, 6.03], '8_10': [3.07, 5.06], '8_12': [2.85, 4.50],
    '8_20': [2.45, 3.56], '8_30': [2.27, 3.17],
    // df1=12
    '12_2': [19.41, 99.42], '12_4': [5.91, 14.37], '12_6': [4.00, 7.72],
    '12_8': [3.28, 5.67], '12_10': [2.91, 4.71], '12_12': [2.69, 4.16],
    '12_20': [2.28, 3.23], '12_30': [2.09, 2.84],
};
/**
 * 查询F临界值
 * 若精确 df 不在表中, 取最近的较小 df2 (保守估计)
 */
function lookupF(df1, df2) {
    // 精确查找
    const key = `${df1}_${df2}`;
    if (F_TABLE[key])
        return F_TABLE[key];
    // 查找最接近的 df2
    const df2Options = Object.keys(F_TABLE)
        .filter(k => k.startsWith(`${df1}_`))
        .map(k => parseInt(k.split('_')[1]))
        .sort((a, b) => a - b);
    if (df2Options.length === 0) {
        // df1 也不在表中, 使用近似
        return [4.0, 7.0]; // 保守默认值
    }
    // 取不超过 df2 的最大值 (保守)
    const nearestDf2 = df2Options.filter(d => d <= df2).pop()
        ?? df2Options[0];
    return F_TABLE[`${df1}_${nearestDf2}`] ?? [4.0, 7.0];
}
/**
 * 根据 F 值和临界值判断显著性
 */
function getSignificance(F, df1, df2) {
    const [f05, f01] = lookupF(df1, df2);
    if (F >= f01) {
        return { significance: '**', pValue: 0.005 }; // 近似
    }
    else if (F >= f05) {
        return { significance: '*', pValue: 0.03 };
    }
    else {
        // 粗略估计 p 值 (线性插值, 仅供参考)
        const pValue = F < 1 ? 0.5 : Math.min(0.5, f05 / F * 0.05);
        return { significance: '', pValue };
    }
}
// ─── 正交试验方差分析 ─────────────────────────────────────
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
function orthogonalAnova(design, results, factors, poolThreshold = 0.1) {
    const n = results.length; // 总试验数
    const responseMap = new Map();
    for (const r of results)
        responseMap.set(r.runIndex, r.response);
    // 总均值
    const yValues = design.runs.map(run => responseMap.get(run.runIndex) ?? 0);
    const yMean = yValues.reduce((a, b) => a + b, 0) / n;
    // 总离差平方和 SS_T
    const ssTotal = yValues.reduce((s, y) => s + (y - yMean) ** 2, 0);
    // 各因素的 SS 和 df
    const factorSS = [];
    for (const factor of factors) {
        const levelCount = factor.levels.length;
        const r = n / levelCount; // 每个水平出现的次数
        // 各水平的指标之和
        const K = new Array(levelCount).fill(0);
        const count = new Array(levelCount).fill(0);
        for (const run of design.runs) {
            const levelIndex = run.factorLevels[factor.name] - 1;
            if (levelIndex === undefined || levelIndex < 0)
                continue;
            K[levelIndex] += responseMap.get(run.runIndex) ?? 0;
            count[levelIndex]++;
        }
        // SS_factor = Σ(K_j² / r) - T²/n
        const T = yValues.reduce((a, b) => a + b, 0);
        let ss = 0;
        for (let j = 0; j < levelCount; j++) {
            if (count[j] > 0) {
                ss += (K[j] * K[j]) / count[j];
            }
        }
        ss -= (T * T) / n;
        factorSS.push({
            name: factor.name,
            ss: Math.max(0, ss), // 防止浮点误差导致负值
            df: levelCount - 1,
        });
    }
    // 空列的 SS 作为误差
    let errorSS = 0;
    let errorDF = 0;
    // 计算空列贡献的 SS
    if (design.errorColumns.length > 0) {
        // 有空列: 空列的 SS 全部归入误差
        const factorSSTotal = factorSS.reduce((s, f) => s + f.ss, 0);
        errorSS = Math.max(0, ssTotal - factorSSTotal);
        errorDF = design.errorColumns.length * (design.array.levelCount - 1);
    }
    // 饱和设计 (无空列 & 无重复) → 合并法
    const pooledFactors = [];
    if (errorDF === 0) {
        // 按SS从小到大排序, 将SS占比最小的因素并入误差, 直到误差 df >= 1
        const sorted = [...factorSS].sort((a, b) => a.ss - b.ss);
        const ssTotalCalc = factorSS.reduce((s, f) => s + f.ss, 0);
        for (const f of sorted) {
            if (errorDF >= 2)
                break; // 误差至少2个自由度
            const ratio = ssTotalCalc > 0 ? f.ss / ssTotalCalc : 0;
            if (ratio < poolThreshold || errorDF < 1) {
                errorSS += f.ss;
                errorDF += f.df;
                pooledFactors.push(f.name);
            }
        }
        // 如果仍然没有误差自由度, 强制合并最小的
        if (errorDF === 0 && factorSS.length > 1) {
            const smallest = sorted[0];
            errorSS += smallest.ss;
            errorDF += smallest.df;
            pooledFactors.push(smallest.name);
        }
    }
    // 构建 ANOVA 表
    const errorMS = errorDF > 0 ? errorSS / errorDF : 0;
    const sources = [];
    for (const f of factorSS) {
        if (pooledFactors.includes(f.name))
            continue; // 已并入误差
        const ms = f.df > 0 ? f.ss / f.df : 0;
        const F = errorMS > 0 ? ms / errorMS : 0;
        const { significance, pValue } = getSignificance(F, f.df, errorDF);
        sources.push({
            name: f.name,
            ss: f.ss,
            df: f.df,
            ms,
            F,
            significance,
            pValue,
        });
    }
    // 按 F 值降序排列
    sources.sort((a, b) => b.F - a.F);
    return {
        ssTotal,
        dfTotal: n - 1,
        sources,
        error: {
            ss: errorSS,
            df: errorDF,
            ms: errorMS,
        },
        pooledFactors,
    };
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
function orthogonalAnovaWithReplicates(design, results, factors) {
    // 将重复试验展开: 取均值作为各行的代表值, 另计算纯误差
    const avgResults = results.map(r => ({
        runIndex: r.runIndex,
        response: r.replicates.reduce((a, b) => a + b, 0) / r.replicates.length,
    }));
    // 纯误差 SS = Σ_i Σ_j (y_ij - ȳ_i)²
    let pureErrorSS = 0;
    let pureErrorDF = 0;
    for (const r of results) {
        const mean = r.replicates.reduce((a, b) => a + b, 0) / r.replicates.length;
        for (const rep of r.replicates) {
            pureErrorSS += (rep - mean) ** 2;
        }
        pureErrorDF += r.replicates.length - 1;
    }
    // 先做无重复分析
    const baseResult = orthogonalAnova(design, avgResults, factors);
    // 替换误差项为纯误差
    const pureErrorMS = pureErrorDF > 0 ? pureErrorSS / pureErrorDF : 0;
    const sources = baseResult.sources.map(s => {
        const F = pureErrorMS > 0 ? s.ms / pureErrorMS : 0;
        const { significance, pValue } = getSignificance(F, s.df, pureErrorDF);
        return { ...s, F, significance, pValue };
    });
    return {
        ssTotal: baseResult.ssTotal,
        dfTotal: baseResult.dfTotal,
        sources,
        error: {
            ss: pureErrorSS,
            df: pureErrorDF,
            ms: pureErrorMS,
        },
        pooledFactors: [], // 有纯误差, 不需要合并
    };
}
//# sourceMappingURL=doe-anova.js.map