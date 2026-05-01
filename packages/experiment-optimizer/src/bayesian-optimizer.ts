// 贝叶斯优化器 — 基于高斯过程的实验参数推荐

export interface ExperimentPoint {
  params: Record<string, number>;
  outcome: number;
}

export interface ParameterBounds {
  name: string; min: number; max: number; step?: number;
}

export class BayesianOptimizer {
  private data: ExperimentPoint[] = [];
  private bounds: ParameterBounds[];
  private lengthScale = 1.0;
  private beta = 2.0; // UCB exploration weight

  constructor(bounds: ParameterBounds[]) { this.bounds = bounds; }

  addObservation(params: Record<string, number>, outcome: number): void {
    this.data.push({ params, outcome });
  }

  loadHistory(points: ExperimentPoint[]): void {
    this.data.push(...points);
  }

  getBest(): ExperimentPoint | null {
    if (this.data.length === 0) return null;
    return this.data.reduce((best, p) => p.outcome > best.outcome ? p : best);
  }

  // RBF kernel
  private kernel(x1: number[], x2: number[]): number {
    let dist = 0;
    for (let i = 0; i < x1.length; i++) dist += (x1[i] - x2[i]) ** 2;
    return Math.exp(-dist / (2 * this.lengthScale ** 2));
  }

  private toVector(params: Record<string, number>): number[] {
    return this.bounds.map(b => (params[b.name] - b.min) / (b.max - b.min)); // normalize 0-1
  }

  predict(params: Record<string, number>): { mean: number; variance: number } {
    if (this.data.length === 0) return { mean: 0, variance: 1 };

    const x = this.toVector(params);
    const n = this.data.length;
    const X = this.data.map(d => this.toVector(d.params));
    const y = this.data.map(d => d.outcome);

    // K matrix + noise
    const K: number[][] = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => this.kernel(X[i], X[j]) + (i === j ? 1e-6 : 0))
    );

    // K* vector
    const Ks = X.map(xi => this.kernel(x, xi));

    // K inverse (simple for small N)
    const Kinv = this.invertMatrix(K);
    if (!Kinv) return { mean: 0, variance: 1 };

    // mean = Ks @ Kinv @ y
    const alpha = this.matVecMul(Kinv, y);
    let mean = 0;
    for (let i = 0; i < n; i++) mean += Ks[i] * alpha[i];

    // variance = K** - Ks @ Kinv @ Ks^T
    const v = this.matVecMul(Kinv, Ks);
    let variance = 1;
    for (let i = 0; i < n; i++) variance -= Ks[i] * v[i];
    variance = Math.max(0.001, variance);

    return { mean, variance };
  }

  recommend(nCandidates = 100): {
    suggestedParams: Record<string, number>;
    expectedImprovement: number;
    confidence: number;
    explorationRatio: number;
  } {
    let bestUCB = -Infinity;
    let bestParams: Record<string, number> = {};

    for (let c = 0; c < nCandidates; c++) {
      const params: Record<string, number> = {};
      for (const b of this.bounds) {
        let v = b.min + Math.random() * (b.max - b.min);
        if (b.step) v = Math.round(v / b.step) * b.step;
        params[b.name] = v;
      }
      const { mean, variance } = this.predict(params);
      const ucb = mean + this.beta * Math.sqrt(variance);
      if (ucb > bestUCB) { bestUCB = ucb; bestParams = params; }
    }

    const pred = this.predict(bestParams);
    const best = this.getBest();
    return {
      suggestedParams: bestParams,
      expectedImprovement: best ? pred.mean - best.outcome : pred.mean,
      confidence: Math.max(0, 1 - Math.sqrt(pred.variance)),
      explorationRatio: Math.sqrt(pred.variance) / (Math.abs(pred.mean) + 0.01),
    };
  }

  // Simple matrix inversion for small matrices (Gauss-Jordan)
  private invertMatrix(m: number[][]): number[][] | null {
    const n = m.length;
    const aug: number[][] = m.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);
    for (let i = 0; i < n; i++) {
      let maxRow = i;
      for (let k = i + 1; k < n; k++) if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) maxRow = k;
      [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];
      if (Math.abs(aug[i][i]) < 1e-12) return null;
      const pivot = aug[i][i];
      for (let j = 0; j < 2 * n; j++) aug[i][j] /= pivot;
      for (let k = 0; k < n; k++) {
        if (k === i) continue;
        const factor = aug[k][i];
        for (let j = 0; j < 2 * n; j++) aug[k][j] -= factor * aug[i][j];
      }
    }
    return aug.map(row => row.slice(n));
  }

  private matVecMul(mat: number[][], vec: number[]): number[] {
    return mat.map(row => row.reduce((s, v, i) => s + v * vec[i], 0));
  }
}
