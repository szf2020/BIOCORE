// ============================================================
// ai-analytics — 纯JS统计分析模块 (零外部AI依赖)
// 职责: CUSUM实时异常检测、DTW批次相似度、包络线计算
// ============================================================

// 新增独立模块
export { CUSUMDetector as CUSUMDetectorV2 } from './cusum';
export { dtwDistance as dtwDistanceV2, rankBySimilarity } from './dtw';
export { buildEnvelope, checkEnvelope } from './envelope';

// ─── CUSUM 异常检测器 ──────────────────────────────────────

export interface CUSUMResult {
  anomaly: boolean;
  direction: 'high' | 'low' | 'none';
  severity: number;         // 0~N, 越大越严重
  cumSumPos: number;
  cumSumNeg: number;
  normalized: number;       // 当前值与基线的标准化偏差 (σ倍数)
  message: string;
}

export class CUSUMDetector {
  private channel: string;
  private threshold: number;   // 检测灵敏度 (σ倍数), 默认4
  private drift: number;       // 允许自然漂移量, 默认1
  private mean: number = 0;
  private std: number = 1;
  private cumSumPos: number = 0;
  private cumSumNeg: number = 0;
  private initialized: boolean = false;

  constructor(channel: string, options: { threshold?: number; drift?: number } = {}) {
    this.channel = channel;
    this.threshold = options.threshold ?? 4.0;
    this.drift = options.drift ?? 1.0;
  }

  // 用历史批次数据建立基线 (均值和标准差)
  buildBaseline(historicalValues: number[]): void {
    if (historicalValues.length < 10) {
      throw new Error(`${this.channel}: 基线数据不足, 至少需要10个数据点, 当前${historicalValues.length}个`);
    }
    this.mean = mean(historicalValues);
    this.std = std(historicalValues);
    if (this.std < 1e-10) this.std = 1; // 避免除零
    this.cumSumPos = 0;
    this.cumSumNeg = 0;
    this.initialized = true;
  }

  // 设置基线参数 (从已知统计值)
  setBaseline(meanVal: number, stdVal: number): void {
    this.mean = meanVal;
    this.std = Math.max(stdVal, 1e-10);
    this.cumSumPos = 0;
    this.cumSumNeg = 0;
    this.initialized = true;
  }

  // 每分钟调用: 输入当前PV值, 返回检测结果
  detect(currentValue: number): CUSUMResult {
    if (!this.initialized) {
      return { anomaly: false, direction: 'none', severity: 0, cumSumPos: 0, cumSumNeg: 0, normalized: 0, message: '基线未初始化' };
    }

    const normalized = (currentValue - this.mean) / this.std;
    this.cumSumPos = Math.max(0, this.cumSumPos + normalized - this.drift);
    this.cumSumNeg = Math.max(0, this.cumSumNeg - normalized - this.drift);

    if (this.cumSumPos > this.threshold || this.cumSumNeg > this.threshold) {
      const direction = this.cumSumPos > this.threshold ? 'high' : 'low';
      const severity = Math.max(this.cumSumPos, this.cumSumNeg) / this.threshold;
      return {
        anomaly: true,
        direction,
        severity,
        cumSumPos: this.cumSumPos,
        cumSumNeg: this.cumSumNeg,
        normalized,
        message: `${this.channel}偏离历史基线 ${normalized.toFixed(1)}σ (${direction === 'high' ? '偏高' : '偏低'}), 累积偏差已触发报警`,
      };
    }

    return {
      anomaly: false,
      direction: 'none',
      severity: 0,
      cumSumPos: this.cumSumPos,
      cumSumNeg: this.cumSumNeg,
      normalized,
      message: '',
    };
  }

  // 重置累积和 (如切换Phase或操作员确认后)
  reset(): void {
    this.cumSumPos = 0;
    this.cumSumNeg = 0;
  }
}

// ─── DTW 批次相似度匹配 ────────────────────────────────────

export interface DTWResult {
  distance: number;         // DTW距离, 越小越相似
  normalizedDistance: number; // 归一化距离 (除以序列长度)
  warpingPath: [number, number][]; // 最优对齐路径
}

export function dtwDistance(series1: number[], series2: number[]): DTWResult {
  const n = series1.length;
  const m = series2.length;

  // 初始化代价矩阵
  const dtw: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(Infinity));
  dtw[0][0] = 0;

  // 填充代价矩阵
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = Math.abs(series1[i - 1] - series2[j - 1]);
      dtw[i][j] = cost + Math.min(dtw[i - 1][j], dtw[i][j - 1], dtw[i - 1][j - 1]);
    }
  }

  // 回溯最优路径
  const path: [number, number][] = [];
  let i = n, j = m;
  path.push([i, j]);
  while (i > 1 || j > 1) {
    if (i === 1) { j--; }
    else if (j === 1) { i--; }
    else {
      const minVal = Math.min(dtw[i - 1][j], dtw[i][j - 1], dtw[i - 1][j - 1]);
      if (dtw[i - 1][j - 1] === minVal) { i--; j--; }
      else if (dtw[i - 1][j] === minVal) { i--; }
      else { j--; }
    }
    path.push([i, j]);
  }

  const distance = dtw[n][m];
  return {
    distance,
    normalizedDistance: distance / (n + m),
    warpingPath: path.reverse(),
  };
}

// 批次相似度排名
export function rankBatchSimilarity(
  targetSeries: number[],
  historicalBatches: { batchId: string; series: number[] }[]
): Array<{ batchId: string; distance: number; normalizedDistance: number; rank: number }> {
  const results = historicalBatches.map(batch => {
    const result = dtwDistance(targetSeries, batch.series);
    return { batchId: batch.batchId, distance: result.distance, normalizedDistance: result.normalizedDistance };
  });

  results.sort((a, b) => a.normalizedDistance - b.normalizedDistance);
  return results.map((r, idx) => ({ ...r, rank: idx + 1 }));
}

// ─── 包络线计算 (历史批次 均值±Nσ) ─────────────────────────

export interface Envelope {
  timePoints: number[];     // 发酵经过分钟数
  mean: number[];
  upper: number[];          // 均值 + N*σ
  lower: number[];          // 均值 - N*σ
  sigma: number;            // N的值
}

export function calculateEnvelope(
  historicalSeries: number[][],  // 多个批次同一参数的时间序列
  sigma: number = 2              // 默认 ±2σ
): Envelope {
  // 找到最短序列长度 (按经过时间对齐)
  const minLen = Math.min(...historicalSeries.map(s => s.length));
  const timePoints: number[] = [];
  const meanValues: number[] = [];
  const upperValues: number[] = [];
  const lowerValues: number[] = [];

  for (let t = 0; t < minLen; t++) {
    const valuesAtT = historicalSeries.map(s => s[t]);
    const m = mean(valuesAtT);
    const s = std(valuesAtT);

    timePoints.push(t);
    meanValues.push(m);
    upperValues.push(m + sigma * s);
    lowerValues.push(m - sigma * s);
  }

  return { timePoints, mean: meanValues, upper: upperValues, lower: lowerValues, sigma };
}

// ─── kLa 经验关联式 (Van't Riet) ───────────────────────────

export interface KLaConfig {
  C?: number;                // 经验系数, 默认 0.026
  a?: number;                // P/V 指数, 默认 0.4
  b?: number;                // Vs 指数, 默认 0.5
  impellerDiameter?: number; // 桨叶直径 m, 默认 0.05
  Np?: number;               // 功率数, 默认 5.0 (Rushton)
  tankDiameter?: number;     // 罐内径 m, 默认 0.15
}

export function estimateKLa(
  rpm: number,
  airflowNLmin: number,
  liquidVolumeL: number,
  config: KLaConfig = {}
): { kLa: number; PV: number; Vs: number } {
  const { C = 0.026, a = 0.4, b = 0.5, impellerDiameter = 0.05, Np = 5.0, tankDiameter = 0.15 } = config;

  const N = rpm / 60; // rps
  const rho = 1000;   // kg/m³
  const P = Np * rho * Math.pow(N, 3) * Math.pow(impellerDiameter, 5); // W
  const PV = P / (liquidVolumeL / 1000); // W/m³

  const Q = (airflowNLmin / 1000) / 60; // m³/s
  const A = Math.PI * Math.pow(tankDiameter / 2, 2); // m²
  const Vs = Q / A; // m/s

  const kLa = C * Math.pow(PV, a) * Math.pow(Vs, b) * 3600; // 1/h
  return { kLa, PV, Vs };
}

// OUR 计算 (稳态法)
export function calculateOUR(kLa: number, DOStar: number, DOMeasured: number): number {
  return kLa * (DOStar - DOMeasured) / 100; // mmol/L/h (DO以%为单位需转换)
}

// F₀ 灭菌值积分 (SIP阶段每分钟调用)
export function calculateF0Increment(tempC: number, deltaMinutes: number = 1, z: number = 10): number {
  return Math.pow(10, (tempC - 121) / z) * deltaMinutes;
}

// ─── 统计工具函数 ───────────────────────────────────────────

export function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}

export function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

export function movingAverage(arr: number[], windowSize: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const window = arr.slice(start, i + 1);
    result.push(mean(window));
  }
  return result;
}
