export { BayesianOptimizer } from './bayesian-optimizer';
export type { ExperimentPoint, ParameterBounds } from './bayesian-optimizer';
export { MultiFidelityOptimizer } from './multi-fidelity';
export type { FidelityLevel } from './multi-fidelity';
export { IncrementalLearner } from './incremental-learner';

// DoE 双向对接 (参照 DASware design)
export {
  generateFullFactorial,
  generateCCD,
  generateLatinHypercube,
  generatePlackettBurman,
  generateBoxBehnken,
  generateFractionalFactorial,
  generateDefinitiveScreening,
  generateDesignMatrix,
} from './doe-designs';
export type { DoEFactor, DesignMatrixRow, DesignType } from './doe-designs';

// ─── 设计诊断 (参考 OApackage) ──────────────────────────
export { evaluateDesign } from './doe-diagnostics';
export type { DesignDiagnostics } from './doe-diagnostics';

export {
  fitResponseModel,
  findOptimum,
  paretoChart,
  buildTermList,
} from './doe-analysis';
export type {
  ModelType,
  ModelFitResult,
  TermCoefficient,
  OptimumResult,
  ObservationPoint,
  ParetoEntry,
} from './doe-analysis';

// ─── 正交试验设计 (《试验设计与数据处理》第4-7章) ──────────
export {
  generateOrthogonalDesign,
  listOrthogonalArrays,
  selectOrthogonalArray,
  getOrthogonalArray,
  BUILTIN_ARRAYS,
} from './doe-orthogonal';

// ─── 极差分析 (第5章) ──────────────────────────────────────
export {
  rangeAnalysis,
  compositeScore,
  multiIndicatorRangeAnalysis,
  analyzeInteraction,
  snRatioAnalysis,
} from './doe-range-analysis';
export type {
  ExperimentResult,
  MultiIndicatorResult,
  InteractionTable,
  SNRatioType,
  SNRatioResult,
} from './doe-range-analysis';

// ─── 正交方差分析 (第6章) ─────────────────────────────────
export {
  orthogonalAnova,
  orthogonalAnovaWithReplicates,
} from './doe-anova';
export type { ReplicatedResult } from './doe-anova';

// ─── 黄金分割法 (第2章) ──────────────────────────────────
export {
  createGoldenSearch,
  advanceGoldenSearch,
  fibonacciSearchPoints,
  createMultiFactorSearch,
  advanceMultiFactorSearch,
} from './doe-golden-section';
export type { MultiFactorSearchState } from './doe-golden-section';

// ─── 均匀设计 (第9章) ────────────────────────────────────
export {
  generateUniformDesign,
  listUniformTables,
  getUniformTable,
  selectUniformTable,
  generateCustomUniformTable,
  BUILTIN_TABLES,
} from './doe-uniform';

// ─── 回归分析 (第8章) ────────────────────────────────────
export {
  polynomialRegression,
  multipleRegression,
  quadraticSurfaceRegression,
  diagnoseResiduals,
} from './doe-regression';
export type {
  RegressionPoint,
  RegressionResult,
  ResidualDiagnostics,
} from './doe-regression';

// ─── 公共类型 ────────────────────────────────────────────
export type {
  DOEFactor,
  OrthogonalArrayMeta,
  OrthogonalDesign,
  OrthogonalRun,
  RangeAnalysisResult,
  FactorRangeResult,
  OrthogonalAnovaResult,
  AnovaSource,
  UniformTableMeta,
  UniformDesign,
  GoldenSectionState,
  OptimizationGoal,
  IndicatorWeight,
  CompositeScore,
} from './doe-types';
