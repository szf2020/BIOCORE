import { describe, it, expect } from 'vitest';
import { CUSUMDetector } from '../cusum';
import { dtwDistance, rankBySimilarity } from '../dtw';
import { buildEnvelope, checkEnvelope } from '../envelope';
import { CUSUMDetector as CUSUMOld, mean, std } from '../index';

describe('CUSUM', () => {
  it('正常数据不报警', () => {
    const d = new CUSUMDetector('temp');
    d.setBaseline(37, 0.3);
    for (let i = 0; i < 20; i++) {
      const r = d.detect(37 + (Math.random() - 0.5) * 0.2);
      expect(r.anomaly).toBe(false);
    }
  });

  it('持续偏移触发报警', () => {
    const d = new CUSUMDetector('temp');
    d.setBaseline(37, 0.3);
    let alarmed = false;
    for (let i = 0; i < 30; i++) {
      const r = d.detect(39); // 偏高2°C
      if (r.anomaly) { alarmed = true; break; }
    }
    expect(alarmed).toBe(true);
  });

  it('reset后重新计数', () => {
    const d = new CUSUMDetector('pH');
    d.setBaseline(7, 0.1);
    for (let i = 0; i < 20; i++) d.detect(8);
    d.reset();
    const r = d.detect(7);
    expect(r.anomaly).toBe(false);
  });
});

describe('DTW', () => {
  it('相同序列距离为0', () => {
    expect(dtwDistance([1, 2, 3], [1, 2, 3])).toBe(0);
  });

  it('不同序列距离>0', () => {
    expect(dtwDistance([1, 2, 3], [4, 5, 6])).toBeGreaterThan(0);
  });

  it('相似度排名', () => {
    const target = [1, 2, 3, 4, 5];
    const ranked = rankBySimilarity(target, [
      { batchId: 'B1', data: [1, 2, 3, 4, 5] },
      { batchId: 'B2', data: [10, 20, 30, 40, 50] },
      { batchId: 'B3', data: [1, 2, 3, 4, 6] },
    ]);
    expect(ranked[0].batchId).toBe('B1');
    expect(ranked[0].distance).toBe(0);
    expect(ranked[2].batchId).toBe('B2');
  });
});

describe('Envelope', () => {
  it('3批次构建包络', () => {
    const e = buildEnvelope([[10, 20, 30], [12, 22, 28], [11, 21, 29]]);
    expect(e.mean).toHaveLength(3);
    expect(e.mean[0]).toBeCloseTo(11);
    expect(e.upper[0]).toBeGreaterThan(e.mean[0]);
    expect(e.lower[0]).toBeLessThan(e.mean[0]);
  });

  it('带内检测', () => {
    const env = buildEnvelope([[10, 20], [10, 20], [10, 20]]);
    const r = checkEnvelope([10, 20], env);
    expect(r.inBand).toBe(true);
  });

  it('超出包络检测', () => {
    const env = buildEnvelope([[10, 20], [10, 20], [10, 20]]);
    const r = checkEnvelope([50, 20], env);
    expect(r.inBand).toBe(false);
  });
});

describe('统计工具', () => {
  it('均值', () => { expect(mean([1, 2, 3])).toBeCloseTo(2); });
  it('标准差', () => { expect(std([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 2); });
});
