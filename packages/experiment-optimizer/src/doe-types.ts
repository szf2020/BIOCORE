// ============================================================
// doe-types.ts — 试验设计与数据处理 公共类型定义
//
// 参考《试验设计与数据处理》方法体系:
//   - 正交试验设计 (第4-7章)
//   - 极差分析 / 方差分析 (第5-6章)
//   - 均匀设计 (第9章)
//   - 黄金分割法 (第2章)
// ============================================================

/** 因素定义 (正交/均匀设计通用) */
export interface DOEFactor {
  /** 因素名称, 如 'temperature', 'pH' */
  name: string;
  /** 各水平的具体值, 如 [34, 37, 40] */
  levels: number[];
  /** 单位, 如 '°C', 'pH' */
  unit?: string;
}

/** 正交表元数据 */
export interface OrthogonalArrayMeta {
  /** 表名, 如 'L9(3^4)' */
  name: string;
  /** 试验次数 */
  runs: number;
  /** 水平数 */
  levelCount: number;
  /** 最大可安排因素数 (列数) */
  maxFactors: number;
  /** 正交表矩阵: runs × maxFactors, 元素为 0-based 水平编号 */
  matrix: number[][];
}

/** 正交试验的一行安排 */
export interface OrthogonalRun {
  /** 1-based 运行序号 */
  runIndex: number;
  /** 因素名 → 实际水平值 */
  factorValues: Record<string, number>;
  /** 因素名 → 水平编号 (1-based) */
  factorLevels: Record<string, number>;
}

/** 正交试验设计结果 */
export interface OrthogonalDesign {
  /** 使用的正交表 */
  array: OrthogonalArrayMeta;
  /** 因素列分配: factorName → 列号 (0-based) */
  columnAssignment: Record<string, number>;
  /** 空列 (未分配因素的列号) */
  errorColumns: number[];
  /** 试验方案 */
  runs: OrthogonalRun[];
}

/** 极差分析结果 (单指标) */
export interface RangeAnalysisResult {
  /** 各因素的分析 */
  factors: FactorRangeResult[];
  /** 因素按极差 R 排序 (影响最大 → 最小) */
  ranking: string[];
  /** 推荐的最优水平组合 */
  optimalCombination: Record<string, number>;
}

/** 单个因素的极差分析 */
export interface FactorRangeResult {
  /** 因素名 */
  name: string;
  /** K_j: 各水平的指标值之和 */
  K: number[];
  /** k_j: 各水平的指标均值 */
  k: number[];
  /** R: 极差 = max(k) - min(k) */
  R: number;
  /** 最优水平编号 (1-based) */
  optimalLevel: number;
  /** 最优水平值 */
  optimalValue: number;
}

/** 方差分析结果 (正交试验) */
export interface OrthogonalAnovaResult {
  /** 总离差平方和 */
  ssTotal: number;
  /** 总自由度 */
  dfTotal: number;
  /** 各因素的方差分析 */
  sources: AnovaSource[];
  /** 误差项 */
  error: {
    ss: number;
    df: number;
    ms: number;
  };
  /** 被合并到误差项的因素名 */
  pooledFactors: string[];
}

/** 单个因素的方差分析源 */
export interface AnovaSource {
  /** 因素名 */
  name: string;
  /** 离差平方和 SS */
  ss: number;
  /** 自由度 df */
  df: number;
  /** 均方 MS = SS/df */
  ms: number;
  /** F 统计量 */
  F: number;
  /** 显著性标记: '**' (p<0.01), '*' (p<0.05), '' (不显著) */
  significance: '**' | '*' | '';
  /** p 值近似 */
  pValue: number;
}

/** 均匀设计表元数据 */
export interface UniformTableMeta {
  /** 表名, 如 'U7(7^3)' */
  name: string;
  /** 试验次数 */
  runs: number;
  /** 水平数 (= runs) */
  levelCount: number;
  /** 最大因素数 */
  maxFactors: number;
  /** 均匀表矩阵: runs × maxFactors, 元素为 1-based 水平编号 */
  matrix: number[][];
}

/** 均匀设计结果 */
export interface UniformDesign {
  /** 使用的均匀表 */
  table: UniformTableMeta;
  /** 因素列分配 */
  columnAssignment: Record<string, number>;
  /** 试验方案 */
  runs: OrthogonalRun[];
}

/** 黄金分割搜索状态 */
export interface GoldenSectionState {
  /** 因素名 */
  factorName: string;
  /** 搜索区间 [a, b] */
  interval: [number, number];
  /** 已完成的试验点 */
  evaluatedPoints: { x: number; y: number }[];
  /** 下一个建议试验点 */
  nextPoint: number | null;
  /** 当前最优点 */
  currentBest: { x: number; y: number } | null;
  /** 是否收敛 */
  converged: boolean;
  /** 迭代次数 */
  iteration: number;
}

/** 优化方向 */
export type OptimizationGoal = 'maximize' | 'minimize';

/** 多指标权重配置 */
export interface IndicatorWeight {
  /** 指标名 */
  name: string;
  /** 权重 (0-1) */
  weight: number;
  /** 优化方向 */
  goal: OptimizationGoal;
}

/** 多指标综合评分 */
export interface CompositeScore {
  /** 综合得分 */
  score: number;
  /** 各指标的归一化值 */
  normalizedValues: Record<string, number>;
  /** 各指标的原始值 */
  rawValues: Record<string, number>;
}
