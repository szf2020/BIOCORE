// ============================================================
// doe-range-analysis.ts — 正交试验极差分析 (直观分析法)
//
// 参考《试验设计与数据处理》第5章:
//   通过计算各因素各水平的指标均值和极差,
//   直观地判断因素的主次顺序和最优水平组合.
//
// 支持:
//   - 单指标极差分析
//   - 多指标综合评分 (归一化加权法)
//   - 交互作用识别 (限2因素)
// ============================================================

import type {
  DOEFactor,
  OrthogonalDesign,
  RangeAnalysisResult,
  FactorRangeResult,
  OptimizationGoal,
  IndicatorWeight,
  CompositeScore,
} from './doe-types';

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

// ─── 单指标极差分析 ─────────────────────────────────────────

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
export function rangeAnalysis(
  design: OrthogonalDesign,
  results: ExperimentResult[],
  factors: DOEFactor[],
  goal: OptimizationGoal = 'maximize',
): RangeAnalysisResult {
  // 建立 runIndex → response 映射
  const responseMap = new Map<number, number>();
  for (const r of results) {
    responseMap.set(r.runIndex, r.response);
  }

  // 验证所有试验都有结果
  for (const run of design.runs) {
    if (!responseMap.has(run.runIndex)) {
      throw new Error(`缺少试验 #${run.runIndex} 的结果`);
    }
  }

  const factorResults: FactorRangeResult[] = [];

  for (const factor of factors) {
    const levelCount = factor.levels.length;
    // K[j] = 第j水平下的指标之和, count[j] = 出现次数
    const K = new Array(levelCount).fill(0);
    const count = new Array(levelCount).fill(0);

    for (const run of design.runs) {
      const levelIndex = run.factorLevels[factor.name] - 1; // 转0-based
      if (levelIndex === undefined || levelIndex < 0) continue;
      const response = responseMap.get(run.runIndex)!;
      K[levelIndex] += response;
      count[levelIndex]++;
    }

    // k[j] = K[j] / count[j]
    const k = K.map((kj, j) => count[j] > 0 ? kj / count[j] : 0);

    // R = max(k) - min(k)
    const R = Math.max(...k) - Math.min(...k);

    // 最优水平: maximize → 取最大k, minimize → 取最小k
    let optimalLevelIndex: number;
    if (goal === 'maximize') {
      optimalLevelIndex = k.indexOf(Math.max(...k));
    } else {
      optimalLevelIndex = k.indexOf(Math.min(...k));
    }

    factorResults.push({
      name: factor.name,
      K,
      k,
      R,
      optimalLevel: optimalLevelIndex + 1,
      optimalValue: factor.levels[optimalLevelIndex],
    });
  }

  // 按 R 降序排序 → 因素重要性排名
  const ranking = [...factorResults]
    .sort((a, b) => b.R - a.R)
    .map(f => f.name);

  // 最优水平组合
  const optimalCombination: Record<string, number> = {};
  for (const fr of factorResults) {
    optimalCombination[fr.name] = fr.optimalValue;
  }

  return {
    factors: factorResults,
    ranking,
    optimalCombination,
  };
}

// ─── 多指标综合评分 ─────────────────────────────────────────

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
export function compositeScore(
  multiResults: MultiIndicatorResult[],
  weights: IndicatorWeight[],
): CompositeScore[] {
  if (multiResults.length === 0 || weights.length === 0) return [];

  // 计算各指标的 min/max
  const ranges: Record<string, { min: number; max: number }> = {};
  for (const w of weights) {
    const values = multiResults.map(r => r.responses[w.name] ?? 0);
    ranges[w.name] = {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }

  // 计算综合评分
  return multiResults.map(result => {
    const normalizedValues: Record<string, number> = {};
    const rawValues: Record<string, number> = {};
    let score = 0;

    for (const w of weights) {
      const raw = result.responses[w.name] ?? 0;
      rawValues[w.name] = raw;

      const { min, max } = ranges[w.name];
      const range = max - min;

      let norm: number;
      if (range === 0) {
        norm = 0.5; // 所有值相同
      } else if (w.goal === 'maximize') {
        norm = (raw - min) / range;
      } else {
        norm = (max - raw) / range;
      }

      normalizedValues[w.name] = norm;
      score += w.weight * norm;
    }

    return { score, normalizedValues, rawValues };
  });
}

/**
 * 对多指标正交试验进行综合极差分析
 *
 * 先算综合评分, 再用综合评分做极差分析.
 */
export function multiIndicatorRangeAnalysis(
  design: OrthogonalDesign,
  multiResults: MultiIndicatorResult[],
  factors: DOEFactor[],
  weights: IndicatorWeight[],
): RangeAnalysisResult {
  const scores = compositeScore(multiResults, weights);

  // 转换为单指标结果 (用综合评分代替)
  const singleResults: ExperimentResult[] = multiResults.map((r, i) => ({
    runIndex: r.runIndex,
    response: scores[i].score,
  }));

  // 综合评分始终 maximize
  return rangeAnalysis(design, singleResults, factors, 'maximize');
}

// ─── 交互作用分析 (限2因素) ─────────────────────────────────

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
export function analyzeInteraction(
  design: OrthogonalDesign,
  results: ExperimentResult[],
  factorA: DOEFactor,
  factorB: DOEFactor,
): InteractionTable {
  const responseMap = new Map<number, number>();
  for (const r of results) responseMap.set(r.runIndex, r.response);

  const levelsA = factorA.levels.length;
  const levelsB = factorB.levels.length;

  // 累加和计数
  const sums = Array.from({ length: levelsA }, () => new Array(levelsB).fill(0));
  const counts = Array.from({ length: levelsA }, () => new Array(levelsB).fill(0));

  for (const run of design.runs) {
    const la = run.factorLevels[factorA.name] - 1;
    const lb = run.factorLevels[factorB.name] - 1;
    if (la === undefined || lb === undefined) continue;
    const y = responseMap.get(run.runIndex) ?? 0;
    sums[la][lb] += y;
    counts[la][lb]++;
  }

  // 均值表
  const means = sums.map((row, i) =>
    row.map((s, j) => counts[i][j] > 0 ? s / counts[i][j] : 0)
  );

  // 交互效应: 偏差平方和
  const grandMean = results.reduce((s, r) => s + r.response, 0) / results.length;
  const rowMeans = means.map(row => {
    const sum = row.reduce((a, b) => a + b, 0);
    const cnt = row.filter((_, j) => counts[means.indexOf(row)][j] > 0).length;
    return cnt > 0 ? sum / cnt : 0;
  });
  const colMeans = Array.from({ length: levelsB }, (_, j) => {
    let sum = 0, cnt = 0;
    for (let i = 0; i < levelsA; i++) {
      if (counts[i][j] > 0) { sum += means[i][j]; cnt++; }
    }
    return cnt > 0 ? sum / cnt : 0;
  });

  let interactionEffect = 0;
  for (let i = 0; i < levelsA; i++) {
    for (let j = 0; j < levelsB; j++) {
      if (counts[i][j] > 0) {
        const deviation = means[i][j] - rowMeans[i] - colMeans[j] + grandMean;
        interactionEffect += deviation * deviation * counts[i][j];
      }
    }
  }

  return {
    factorA: factorA.name,
    factorB: factorB.name,
    means,
    interactionEffect,
  };
}

// ─── 田口信噪比 S/N 分析 (参考 Minitab Taguchi) ──────────

/** S/N 比类型 */
export type SNRatioType = 'larger_better' | 'smaller_better' | 'nominal_best';

/** S/N 比计算结果 */
export interface SNRatioResult {
  type: SNRatioType;
  typeLabel: string;
  /** 各试验的 S/N 比值 */
  snValues: { runIndex: number; sn: number }[];
  /** 各因素各水平的 S/N 均值 (用于极差分析) */
  factorSN: { name: string; levels: number[]; snMeans: number[]; range: number; optimalLevel: number }[];
  /** 因素按 S/N 极差排名 */
  ranking: string[];
}

const SN_TYPE_LABELS: Record<SNRatioType, string> = {
  larger_better: '望大特性 (越大越好)',
  smaller_better: '望小特性 (越小越好)',
  nominal_best: '望目特性 (越接近目标越好)',
};

/**
 * 计算单个值的 S/N 比 (有重复试验时传数组)
 */
function computeSN(values: number[], type: SNRatioType): number {
  const n = values.length;
  if (n === 0) return 0;

  switch (type) {
    case 'larger_better':
      // S/N = -10 log(1/n × Σ(1/yi²))
      return -10 * Math.log10(values.reduce((s, y) => s + 1 / (y * y + 1e-12), 0) / n);
    case 'smaller_better':
      // S/N = -10 log(1/n × Σyi²)
      return -10 * Math.log10(values.reduce((s, y) => s + y * y, 0) / n);
    case 'nominal_best': {
      // S/N = 10 log(ȳ² / s²)
      const mean = values.reduce((a, b) => a + b, 0) / n;
      const variance = values.reduce((s, y) => s + (y - mean) ** 2, 0) / Math.max(1, n - 1);
      return variance > 0 ? 10 * Math.log10((mean * mean) / variance) : 0;
    }
  }
}

/**
 * 田口 S/N 比分析 (替代极差分析中的原始响应值)
 *
 * @param design - 正交设计
 * @param results - 各试验结果 (支持重复: 一个 runIndex 多个值)
 * @param factors - 因素定义
 * @param type - S/N 类型
 */
export function snRatioAnalysis(
  design: OrthogonalDesign,
  results: { runIndex: number; values: number[] }[],
  factors: DOEFactor[],
  type: SNRatioType = 'larger_better',
): SNRatioResult {
  // 计算每次试验的 S/N 比
  const snValues = results.map(r => ({
    runIndex: r.runIndex,
    sn: computeSN(r.values, type),
  }));

  const snMap = new Map<number, number>();
  for (const sv of snValues) snMap.set(sv.runIndex, sv.sn);

  // 对 S/N 值做极差分析 (S/N 越大越好, 不管什么类型)
  const factorSN = factors.map(factor => {
    const levelCount = factor.levels.length;
    const snSums = new Array(levelCount).fill(0);
    const counts = new Array(levelCount).fill(0);

    for (const run of design.runs) {
      const levelIndex = run.factorLevels[factor.name] - 1;
      if (levelIndex < 0 || levelIndex >= levelCount) continue;
      const sn = snMap.get(run.runIndex) ?? 0;
      snSums[levelIndex] += sn;
      counts[levelIndex]++;
    }

    const snMeans = snSums.map((s, j) => counts[j] > 0 ? s / counts[j] : 0);
    const range = Math.max(...snMeans) - Math.min(...snMeans);
    const optimalLevel = snMeans.indexOf(Math.max(...snMeans)) + 1; // S/N 越大越好

    return {
      name: factor.name,
      levels: factor.levels,
      snMeans: snMeans.map(v => Math.round(v * 1000) / 1000),
      range: Math.round(range * 1000) / 1000,
      optimalLevel,
    };
  });

  const ranking = [...factorSN]
    .sort((a, b) => b.range - a.range)
    .map(f => f.name);

  return {
    type,
    typeLabel: SN_TYPE_LABELS[type],
    snValues,
    factorSN,
    ranking,
  };
}
