// 多保真度优化 — 摇瓶→发酵罐数据融合

import { ExperimentPoint, BayesianOptimizer, ParameterBounds } from './bayesian-optimizer';

export interface FidelityLevel {
  name: string;
  cost: number;
  reliability: number; // 0-1
}

export class MultiFidelityOptimizer {
  private levels: FidelityLevel[];
  private data = new Map<string, ExperimentPoint[]>();
  private bounds: ParameterBounds[];

  constructor(levels: FidelityLevel[], bounds: ParameterBounds[] = []) {
    this.levels = levels;
    this.bounds = bounds;
    for (const l of levels) this.data.set(l.name, []);
  }

  setBounds(bounds: ParameterBounds[]): void { this.bounds = bounds; }

  addObservation(level: string, params: Record<string, number>, outcome: number): void {
    this.data.get(level)?.push({ params, outcome });
  }

  importShakeFlaskData(data: { params: Record<string, number>; outcome: number }[]): void {
    for (const d of data) this.addObservation('shake_flask', d.params, d.outcome);
  }

  recommend(): { suggestedLevel: string; suggestedParams: Record<string, number>; reason: string } {
    const sorted = [...this.levels].sort((a, b) => a.cost - b.cost);

    // 如果低保真度数据不足，先收集低成本数据
    for (const level of sorted) {
      const points = this.data.get(level.name) || [];
      if (points.length < 5) {
        // 用已有数据推荐参数，如果有足够多则用贝叶斯优化
        const suggestedParams = this.suggestParams(level.name);
        return {
          suggestedLevel: level.name,
          suggestedParams,
          reason: `${level.name}数据不足(${points.length}/5), 建议先补充低成本实验`,
        };
      }
    }

    // 数据充足时，用所有保真度数据（加权）找最优参数，推荐高保真度验证
    const highFidelity = sorted[sorted.length - 1];
    const suggestedParams = this.suggestParams(highFidelity.name);
    return {
      suggestedLevel: highFidelity.name,
      suggestedParams,
      reason: `低保真度数据充足, 建议在${highFidelity.name}验证最优参数`,
    };
  }

  /**
   * 用贝叶斯优化从指定保真度及以下的数据中推荐参数
   * 低保真度数据的outcome按reliability系数缩放
   */
  private suggestParams(targetLevel: string): Record<string, number> {
    if (this.bounds.length === 0) {
      // 没有bounds时，返回最佳观测值的参数
      return this.getBestParams();
    }

    const optimizer = new BayesianOptimizer(this.bounds);
    const targetIdx = this.levels.findIndex(l => l.name === targetLevel);

    // 加载所有保真度 <= target 的数据，按reliability加权
    for (let i = 0; i <= targetIdx; i++) {
      const level = this.levels[i];
      const points = this.data.get(level.name) || [];
      for (const p of points) {
        // 低保真度数据的outcome按reliability缩放
        optimizer.addObservation(p.params, p.outcome * level.reliability);
      }
    }

    // 也加载高保真度数据（如有）
    for (let i = targetIdx + 1; i < this.levels.length; i++) {
      const level = this.levels[i];
      const points = this.data.get(level.name) || [];
      for (const p of points) {
        optimizer.addObservation(p.params, p.outcome);
      }
    }

    // 数据少于3条时返回最佳观测值
    const allPoints = Array.from(this.data.values()).flat();
    if (allPoints.length < 3) return this.getBestParams();

    return optimizer.recommend().suggestedParams;
  }

  private getBestParams(): Record<string, number> {
    // 用加权值比较，但返回原始params
    let bestParams: Record<string, number> | null = null;
    let bestWeighted = -Infinity;
    for (const [levelName, points] of this.data) {
      const level = this.levels.find(l => l.name === levelName);
      if (!level) continue;
      for (const p of points) {
        const weighted = p.outcome * level.reliability;
        if (weighted > bestWeighted) {
          bestWeighted = weighted;
          bestParams = p.params;
        }
      }
    }
    return bestParams || {};
  }

  getDataCount(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const [name, points] of this.data) counts[name] = points.length;
    return counts;
  }
}
