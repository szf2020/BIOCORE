// ============================================================
// services/metrics.ts — 自写 Prometheus metrics 注册表
//
// SP-FX-28: ZERO 新第三方依赖，输出标准 Prometheus text format v0.0.4
//
// 支持:
//   Counter   — 单调递增计数器，支持 labels
//   Histogram — sum + count + 固定 buckets [0.01,0.05,0.1,0.5,1,5]
//   Gauge     — 可任意设置的即时值，支持 labels
// ============================================================

/** Labels 键值对，所有值转为字符串 */
export type Labels = Record<string, string>;

/** 将 labels 对象转换为确定性字符串 key */
function labelKey(labels?: Labels): string {
  if (!labels || Object.keys(labels).length === 0) return '';
  return Object.keys(labels)
    .sort()
    .map((k) => `${k}="${labels[k]}"`)
    .join(',');
}

// ─── Counter ────────────────────────────────────────────────

export class Counter {
  private readonly counts = new Map<string, number>();

  constructor(
    readonly name: string,
    readonly help: string = '',
  ) {}

  inc(labels?: Labels): void {
    const key = labelKey(labels);
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }

  get(labels?: Labels): number {
    return this.counts.get(labelKey(labels)) ?? 0;
  }

  serialize(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} counter`,
    ];
    if (this.counts.size === 0) {
      lines.push(`${this.name} 0`);
    } else {
      for (const [key, value] of this.counts) {
        const labelStr = key ? `{${key}}` : '';
        lines.push(`${this.name}${labelStr} ${value}`);
      }
    }
    return lines.join('\n');
  }
}

// ─── Histogram ──────────────────────────────────────────────

export const HISTOGRAM_BUCKETS = [0.01, 0.05, 0.1, 0.5, 1, 5] as const;

export interface HistogramSnapshot {
  sum: number;
  count: number;
  /** cumulative bucket counts, key = upper bound */
  buckets: Record<number, number>;
}

export class Histogram {
  private sum = 0;
  private count = 0;
  private readonly bucketCounts: Map<number, number>;

  constructor(
    readonly name: string,
    readonly help: string = '',
  ) {
    this.bucketCounts = new Map(HISTOGRAM_BUCKETS.map((b) => [b, 0]));
  }

  observe(value: number): void {
    this.sum += value;
    this.count += 1;
    for (const bound of HISTOGRAM_BUCKETS) {
      if (value <= bound) {
        this.bucketCounts.set(bound, (this.bucketCounts.get(bound) ?? 0) + 1);
      }
    }
  }

  snapshot(): HistogramSnapshot {
    // observe() 已将每个值计入所有 ≤bound 的 bucket，bucketCounts 本身是累积值
    const buckets: Record<number, number> = {};
    for (const bound of HISTOGRAM_BUCKETS) {
      buckets[bound] = this.bucketCounts.get(bound) ?? 0;
    }
    return { sum: this.sum, count: this.count, buckets };
  }

  serialize(): string {
    const snap = this.snapshot();
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} histogram`,
    ];
    for (const bound of HISTOGRAM_BUCKETS) {
      lines.push(`${this.name}_bucket{le="${bound}"} ${snap.buckets[bound]}`);
    }
    lines.push(`${this.name}_bucket{le="+Inf"} ${snap.count}`);
    lines.push(`${this.name}_sum ${snap.sum}`);
    lines.push(`${this.name}_count ${snap.count}`);
    return lines.join('\n');
  }
}

// ─── Gauge ──────────────────────────────────────────────────

export class Gauge {
  private readonly values = new Map<string, number>();

  constructor(
    readonly name: string,
    readonly help: string = '',
  ) {}

  set(value: number, labels?: Labels): void {
    this.values.set(labelKey(labels), value);
  }

  get(labels?: Labels): number {
    return this.values.get(labelKey(labels)) ?? 0;
  }

  serialize(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} gauge`,
    ];
    if (this.values.size === 0) {
      lines.push(`${this.name} 0`);
    } else {
      for (const [key, value] of this.values) {
        const labelStr = key ? `{${key}}` : '';
        lines.push(`${this.name}${labelStr} ${value}`);
      }
    }
    return lines.join('\n');
  }
}

// ─── MetricsRegistry ────────────────────────────────────────

export class MetricsRegistry {
  private readonly counters = new Map<string, Counter>();
  private readonly histograms = new Map<string, Histogram>();
  private readonly gauges = new Map<string, Gauge>();

  /** 获取或创建 Counter（同名调用返回同一实例） */
  counter(name: string, help = ''): Counter {
    if (!this.counters.has(name)) {
      this.counters.set(name, new Counter(name, help));
    }
    return this.counters.get(name)!;
  }

  /** 获取或创建 Histogram */
  histogram(name: string, help = ''): Histogram {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, new Histogram(name, help));
    }
    return this.histograms.get(name)!;
  }

  /** 获取或创建 Gauge */
  gauge(name: string, help = ''): Gauge {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, new Gauge(name, help));
    }
    return this.gauges.get(name)!;
  }

  /** 序列化所有 metrics 为 Prometheus text format */
  serialize(): string {
    const parts: string[] = [];
    for (const c of this.counters.values()) {
      parts.push(c.serialize());
    }
    for (const h of this.histograms.values()) {
      parts.push(h.serialize());
    }
    for (const g of this.gauges.values()) {
      parts.push(g.serialize());
    }
    return parts.join('\n\n') + (parts.length > 0 ? '\n' : '');
  }
}

// ─── 全局单例（server 各模块共享） ───────────────────────────

export const metricsRegistry = new MetricsRegistry();
