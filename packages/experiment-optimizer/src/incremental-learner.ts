// 增量学习器 — 每完成一个批次自动更新模型

export class IncrementalLearner {
  private version = 0;
  private featureNames: string[];
  private data: { features: number[]; target: number }[] = [];
  private coefficients: number[] = [];
  private intercept = 0;
  private rSquared = 0;

  constructor(featureNames: string[]) {
    this.featureNames = featureNames;
    this.coefficients = featureNames.map(() => 0);
  }

  addBatch(features: Record<string, number>, target: number): void {
    const vec = this.featureNames.map(f => features[f] ?? 0);
    this.data.push({ features: vec, target });
    if (this.data.length >= 3) this.retrain();
  }

  retrain(): { r_squared: number; coefficients: number[]; intercept: number; sampleCount: number } {
    const n = this.data.length;
    const p = this.featureNames.length;
    if (n < p + 1) return { r_squared: 0, coefficients: this.coefficients, intercept: this.intercept, sampleCount: n };

    // OLS: β = (XᵀX)⁻¹Xᵀy
    // Augment X with ones column for intercept
    const X = this.data.map(d => [1, ...d.features]);
    const y = this.data.map(d => d.target);

    const XtX = this.matMul(this.transpose(X), X);
    const XtXinv = this.invertMatrix(XtX);
    if (!XtXinv) return { r_squared: 0, coefficients: this.coefficients, intercept: this.intercept, sampleCount: n };

    const Xty = this.matVecMul(this.transpose(X), y);
    const beta = this.matVecMul(XtXinv, Xty);

    this.intercept = beta[0];
    this.coefficients = beta.slice(1);
    this.version++;

    // R²
    const yMean = y.reduce((a, b) => a + b, 0) / n;
    let ssRes = 0, ssTot = 0;
    for (let i = 0; i < n; i++) {
      const pred = this.intercept + this.data[i].features.reduce((s, f, j) => s + f * this.coefficients[j], 0);
      ssRes += (y[i] - pred) ** 2;
      ssTot += (y[i] - yMean) ** 2;
    }
    this.rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    return { r_squared: this.rSquared, coefficients: [...this.coefficients], intercept: this.intercept, sampleCount: n };
  }

  predict(features: Record<string, number>): number {
    const vec = this.featureNames.map(f => features[f] ?? 0);
    return this.intercept + vec.reduce((s, f, i) => s + f * this.coefficients[i], 0);
  }

  getModelInfo() {
    return { version: this.version, sampleCount: this.data.length, r_squared: this.rSquared, featureNames: this.featureNames };
  }

  private transpose(m: number[][]): number[][] {
    return m[0].map((_, j) => m.map(row => row[j]));
  }

  private matMul(a: number[][], b: number[][]): number[][] {
    return a.map(row => b[0].map((_, j) => row.reduce((s, v, k) => s + v * b[k][j], 0)));
  }

  private matVecMul(m: number[][], v: number[]): number[] {
    return m.map(row => row.reduce((s, val, i) => s + val * v[i], 0));
  }

  private invertMatrix(m: number[][]): number[][] | null {
    const n = m.length;
    const aug = m.map((r, i) => [...r, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);
    for (let i = 0; i < n; i++) {
      let max = i;
      for (let k = i + 1; k < n; k++) if (Math.abs(aug[k][i]) > Math.abs(aug[max][i])) max = k;
      [aug[i], aug[max]] = [aug[max], aug[i]];
      if (Math.abs(aug[i][i]) < 1e-12) return null;
      const p = aug[i][i];
      for (let j = 0; j < 2 * n; j++) aug[i][j] /= p;
      for (let k = 0; k < n; k++) { if (k === i) continue; const f = aug[k][i]; for (let j = 0; j < 2 * n; j++) aug[k][j] -= f * aug[i][j]; }
    }
    return aug.map(r => r.slice(n));
  }
}
