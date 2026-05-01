// ============================================================
// soft-sensor — Mock/simulation inference engine (v3.0)
// Uses simple linear regression models (replaceable with ONNX later)
// ============================================================

export interface SoftSensorModel {
  id: string;
  name: string;
  target: string; // 'OD600' | 'glucose' | 'product_titer'
  input_features: string[];
  coefficients: number[]; // linear regression coefficients
  intercept: number;
  r_squared: number;
  training_batches: number;
  status: 'active' | 'inactive';
}

export interface PredictionResult {
  value: number;
  ciLower: number; // 95% CI lower
  ciUpper: number; // 95% CI upper
  isExtrapolating: boolean; // features outside training range
}

export class SoftSensorEngine {
  private models: Map<string, SoftSensorModel> = new Map();
  private featureRanges: Map<string, Record<string, [number, number]>> = new Map();

  registerModel(model: SoftSensorModel): void {
    this.models.set(model.id, { ...model });
  }

  removeModel(id: string): void {
    this.models.delete(id);
    this.featureRanges.delete(id);
  }

  listModels(): SoftSensorModel[] {
    return Array.from(this.models.values());
  }

  /**
   * Run inference: input features -> predicted value + confidence interval
   */
  predict(modelId: string, features: Record<string, number>): PredictionResult {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    if (model.status !== 'active') {
      throw new Error(`Model ${modelId} is not active`);
    }

    // Linear regression: y = intercept + sum(coeff_i * feature_i)
    let value = model.intercept;
    for (let i = 0; i < model.input_features.length; i++) {
      const featureName = model.input_features[i];
      const featureValue = features[featureName];
      if (featureValue === undefined) {
        throw new Error(`Missing feature: ${featureName}`);
      }
      value += model.coefficients[i] * featureValue;
    }

    // Check extrapolation against stored training ranges
    const ranges = this.featureRanges.get(modelId);
    let isExtrapolating = false;
    if (ranges) {
      for (const featureName of model.input_features) {
        const range = ranges[featureName];
        if (range) {
          const v = features[featureName];
          if (v < range[0] || v > range[1]) {
            isExtrapolating = true;
            break;
          }
        }
      }
    }

    // 95% CI estimate based on R² and training data size
    // Wider intervals for lower R² and fewer training batches
    const stdError = Math.abs(value) * Math.sqrt((1 - model.r_squared) / Math.max(1, model.training_batches));
    const zScore = 1.96; // 95% confidence
    const margin = zScore * stdError;

    return {
      value,
      ciLower: value - margin,
      ciUpper: value + margin,
      isExtrapolating,
    };
  }

  /**
   * Train a simple linear regression from historical data using
   * ordinary least squares (OLS) via normal equation.
   */
  static trainLinearModel(
    target: string,
    features: string[],
    data: Record<string, number>[],
  ): SoftSensorModel {
    if (data.length === 0) {
      throw new Error('No training data provided');
    }
    if (features.length === 0) {
      throw new Error('No features specified');
    }

    const n = data.length;
    const p = features.length;

    // Extract y vector and X matrix (with intercept column)
    const y: number[] = data.map(row => row[target]);
    const X: number[][] = data.map(row => [1, ...features.map(f => row[f] ?? 0)]);

    // Normal equation: beta = (X^T X)^-1 X^T y
    // For simplicity, use a direct solve for small feature sets
    const XtX = createMatrix(p + 1, p + 1);
    const Xty = new Array(p + 1).fill(0);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < p + 1; j++) {
        Xty[j] += X[i][j] * y[i];
        for (let k = 0; k < p + 1; k++) {
          XtX[j][k] += X[i][j] * X[i][k];
        }
      }
    }

    // Solve via Gaussian elimination
    const beta = solveLinearSystem(XtX, Xty);

    const intercept = beta[0];
    const coefficients = beta.slice(1);

    // Calculate R²
    const yMean = y.reduce((s, v) => s + v, 0) / n;
    let ssTot = 0;
    let ssRes = 0;
    for (let i = 0; i < n; i++) {
      const predicted = intercept + features.reduce((sum, f, idx) => sum + coefficients[idx] * (data[i][f] ?? 0), 0);
      ssRes += (y[i] - predicted) ** 2;
      ssTot += (y[i] - yMean) ** 2;
    }
    const r_squared = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

    const model: SoftSensorModel = {
      id: `model_${target}_${Date.now()}`,
      name: `Linear model for ${target}`,
      target,
      input_features: [...features],
      coefficients,
      intercept,
      r_squared,
      training_batches: n,
      status: 'active',
    };

    return model;
  }

  /**
   * Store feature ranges for extrapolation detection.
   * Typically called after training with training data min/max.
   */
  setFeatureRanges(modelId: string, ranges: Record<string, [number, number]>): void {
    this.featureRanges.set(modelId, { ...ranges });
  }
}

// ─── Linear algebra helpers ─────────────────────────────────

function createMatrix(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () => new Array(cols).fill(0));
}

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  // Augmented matrix
  const aug: number[][] = A.map((row, i) => [...row, b[i]]);

  // Forward elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxRow = col;
    let maxVal = Math.abs(aug[col][col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > maxVal) {
        maxVal = Math.abs(aug[row][col]);
        maxRow = row;
      }
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-12) {
      // Singular or near-singular; set coefficient to 0
      aug[col][n] = 0;
      continue;
    }

    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / pivot;
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    if (Math.abs(aug[row][row]) < 1e-12) {
      x[row] = 0;
      continue;
    }
    let sum = aug[row][n];
    for (let col = row + 1; col < n; col++) {
      sum -= aug[row][col] * x[col];
    }
    x[row] = sum / aug[row][row];
  }

  return x;
}

// ─── Feature engineering utility (carried forward) ──────────

export function engineerFeatures(
  rawData: Record<string, number>,
  history: Record<string, number[]>,
  elapsedHours: number,
): Record<string, number> {
  const features: Record<string, number> = {
    ...rawData,
    elapsed_h: elapsedHours,
  };

  // Sliding window average (last 10 readings)
  for (const [key, vals] of Object.entries(history)) {
    if (vals.length >= 10) {
      const window = vals.slice(-10);
      features[`${key}_ma10`] = window.reduce((s, v) => s + v, 0) / window.length;
    }
  }

  // First-order difference (rate of change)
  for (const [key, vals] of Object.entries(history)) {
    if (vals.length >= 2) {
      features[`${key}_diff`] = vals[vals.length - 1] - vals[vals.length - 2];
    }
  }

  // Cumulative feed (if feed_rate exists)
  if (history.feed_rate) {
    features.cumulative_feed = history.feed_rate.reduce((s, v) => s + v / 60, 0);
  }

  return features;
}

export { FeedAdvisor } from './feed-advisor.js';
export { RootCauseAnalyzer } from './root-cause.js';
export { MultiReactorManager } from './multi-reactor.js';
