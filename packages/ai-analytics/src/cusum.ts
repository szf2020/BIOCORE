// CUSUM (Cumulative Sum) 异常检测器
// 基于历史批次均值±标准差的在线偏移检测

export class CUSUMDetector {
  private mean = 0;
  private std = 1;
  private h = 4;     // 报警阈值 (h × std)
  private k = 0.5;   // 漂移容许 (k × std)
  private cumPos = 0;
  private cumNeg = 0;
  private configured = false;

  constructor(private channel: string = '') {}

  setBaseline(mean: number, std: number, h = 4, k = 0.5): void {
    this.mean = mean;
    this.std = Math.max(std, 0.001);
    this.h = h;
    this.k = k;
    this.configured = true;
    this.reset();
  }

  detect(value: number): { anomaly: boolean; cumPos: number; cumNeg: number; normalized: number } {
    if (!this.configured) return { anomaly: false, cumPos: 0, cumNeg: 0, normalized: 0 };

    const z = (value - this.mean) / this.std;
    const drift = this.k;

    this.cumPos = Math.max(0, this.cumPos + z - drift);
    this.cumNeg = Math.max(0, this.cumNeg - z - drift);

    const anomaly = this.cumPos > this.h || this.cumNeg > this.h;
    return { anomaly, cumPos: this.cumPos, cumNeg: this.cumNeg, normalized: z };
  }

  reset(): void { this.cumPos = 0; this.cumNeg = 0; }
  isConfigured(): boolean { return this.configured; }
  getChannel(): string { return this.channel; }
}
