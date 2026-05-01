"use strict";
// 贝叶斯优化器 — 基于高斯过程的实验参数推荐
Object.defineProperty(exports, "__esModule", { value: true });
exports.BayesianOptimizer = void 0;
class BayesianOptimizer {
    data = [];
    bounds;
    lengthScale = 1.0;
    beta = 2.0; // UCB exploration weight
    constructor(bounds) { this.bounds = bounds; }
    addObservation(params, outcome) {
        this.data.push({ params, outcome });
    }
    loadHistory(points) {
        this.data.push(...points);
    }
    getBest() {
        if (this.data.length === 0)
            return null;
        return this.data.reduce((best, p) => p.outcome > best.outcome ? p : best);
    }
    // RBF kernel
    kernel(x1, x2) {
        let dist = 0;
        for (let i = 0; i < x1.length; i++)
            dist += (x1[i] - x2[i]) ** 2;
        return Math.exp(-dist / (2 * this.lengthScale ** 2));
    }
    toVector(params) {
        return this.bounds.map(b => (params[b.name] - b.min) / (b.max - b.min)); // normalize 0-1
    }
    predict(params) {
        if (this.data.length === 0)
            return { mean: 0, variance: 1 };
        const x = this.toVector(params);
        const n = this.data.length;
        const X = this.data.map(d => this.toVector(d.params));
        const y = this.data.map(d => d.outcome);
        // K matrix + noise
        const K = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => this.kernel(X[i], X[j]) + (i === j ? 1e-6 : 0)));
        // K* vector
        const Ks = X.map(xi => this.kernel(x, xi));
        // K inverse (simple for small N)
        const Kinv = this.invertMatrix(K);
        if (!Kinv)
            return { mean: 0, variance: 1 };
        // mean = Ks @ Kinv @ y
        const alpha = this.matVecMul(Kinv, y);
        let mean = 0;
        for (let i = 0; i < n; i++)
            mean += Ks[i] * alpha[i];
        // variance = K** - Ks @ Kinv @ Ks^T
        const v = this.matVecMul(Kinv, Ks);
        let variance = 1;
        for (let i = 0; i < n; i++)
            variance -= Ks[i] * v[i];
        variance = Math.max(0.001, variance);
        return { mean, variance };
    }
    recommend(nCandidates = 100) {
        let bestUCB = -Infinity;
        let bestParams = {};
        for (let c = 0; c < nCandidates; c++) {
            const params = {};
            for (const b of this.bounds) {
                let v = b.min + Math.random() * (b.max - b.min);
                if (b.step)
                    v = Math.round(v / b.step) * b.step;
                params[b.name] = v;
            }
            const { mean, variance } = this.predict(params);
            const ucb = mean + this.beta * Math.sqrt(variance);
            if (ucb > bestUCB) {
                bestUCB = ucb;
                bestParams = params;
            }
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
    invertMatrix(m) {
        const n = m.length;
        const aug = m.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);
        for (let i = 0; i < n; i++) {
            let maxRow = i;
            for (let k = i + 1; k < n; k++)
                if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i]))
                    maxRow = k;
            [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];
            if (Math.abs(aug[i][i]) < 1e-12)
                return null;
            const pivot = aug[i][i];
            for (let j = 0; j < 2 * n; j++)
                aug[i][j] /= pivot;
            for (let k = 0; k < n; k++) {
                if (k === i)
                    continue;
                const factor = aug[k][i];
                for (let j = 0; j < 2 * n; j++)
                    aug[k][j] -= factor * aug[i][j];
            }
        }
        return aug.map(row => row.slice(n));
    }
    matVecMul(mat, vec) {
        return mat.map(row => row.reduce((s, v, i) => s + v * vec[i], 0));
    }
}
exports.BayesianOptimizer = BayesianOptimizer;
//# sourceMappingURL=bayesian-optimizer.js.map