import { describe, it, expect } from 'vitest';
import { BayesianOptimizer } from '../bayesian-optimizer';
import { MultiFidelityOptimizer } from '../multi-fidelity';
import { IncrementalLearner } from '../incremental-learner';

describe('BayesianOptimizer', () => {
  const bounds = [
    { name: 'temperature', min: 30, max: 40 },
    { name: 'pH', min: 5, max: 8 },
  ];

  it('推荐在bounds范围内', () => {
    const opt = new BayesianOptimizer(bounds);
    opt.addObservation({ temperature: 37, pH: 7 }, 20);
    opt.addObservation({ temperature: 35, pH: 6 }, 15);
    opt.addObservation({ temperature: 39, pH: 7.5 }, 18);
    const rec = opt.recommend();
    expect(rec.suggestedParams.temperature).toBeGreaterThanOrEqual(30);
    expect(rec.suggestedParams.temperature).toBeLessThanOrEqual(40);
    expect(rec.suggestedParams.pH).toBeGreaterThanOrEqual(5);
    expect(rec.suggestedParams.pH).toBeLessThanOrEqual(8);
  });

  it('getBest返回最优', () => {
    const opt = new BayesianOptimizer(bounds);
    opt.addObservation({ temperature: 37, pH: 7 }, 20);
    opt.addObservation({ temperature: 35, pH: 6 }, 25);
    expect(opt.getBest()!.outcome).toBe(25);
  });

  it('predict返回均值和方差', () => {
    const opt = new BayesianOptimizer(bounds);
    opt.addObservation({ temperature: 37, pH: 7 }, 20);
    const p = opt.predict({ temperature: 37, pH: 7 });
    expect(p.mean).toBeCloseTo(20, 0);
    expect(p.variance).toBeGreaterThan(0);
  });
});

describe('MultiFidelityOptimizer', () => {
  it('数据不足推荐低成本实验', () => {
    const opt = new MultiFidelityOptimizer([
      { name: 'shake_flask', cost: 1, reliability: 0.6 },
      { name: 'bioreactor', cost: 10, reliability: 0.95 },
    ]);
    opt.addObservation('shake_flask', { temp: 37 }, 10);
    const rec = opt.recommend();
    expect(rec.suggestedLevel).toBe('shake_flask');
    expect(rec.reason).toContain('不足');
  });
});

describe('IncrementalLearner', () => {
  it('线性数据训练和预测', () => {
    const learner = new IncrementalLearner(['x']);
    // y = 2x + 1
    for (let x = 1; x <= 10; x++) learner.addBatch({ x }, 2 * x + 1);
    const info = learner.getModelInfo();
    expect(info.r_squared).toBeGreaterThan(0.95);
    expect(learner.predict({ x: 5 })).toBeCloseTo(11, 0);
  });

  it('增量更新提高精度', () => {
    const learner = new IncrementalLearner(['x', 'y']);
    for (let i = 0; i < 5; i++) learner.addBatch({ x: i, y: i * 2 }, i * 3 + i * 2);
    const info1 = learner.getModelInfo();
    for (let i = 5; i < 15; i++) learner.addBatch({ x: i, y: i * 2 }, i * 3 + i * 2);
    const info2 = learner.getModelInfo();
    expect(info2.sampleCount).toBeGreaterThan(info1.sampleCount);
  });
});
