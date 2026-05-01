// ============================================================
// collector.ts — 数据采集调度器
// 每分钟: 读PLC → 写InfluxDB → 计算软件测算值 → WebSocket推送
// 每秒: 读PLC → WebSocket推送PV (不写库)
// ============================================================

// ============================================================
// DataCollector — PLC数据采集器
// 每秒: 读PLC → emit('pv_realtime') → WebSocket推送
// 每分钟: 缓冲区均值 → emit('record') → InfluxDB写入
// 不直接依赖 InfluxDB/PLC，通过注入函数解耦
// ============================================================

import { EventEmitter } from 'events';

/** 公式系数配置 (从数据库 formula_configs 加载) */
export interface FormulaCoefficients {
  kLa?: { C?: number; a?: number; b?: number; tankArea?: number; rpmRef?: number; pvMultiplier?: number };
  OUR?: { DOStar?: number };
  mu?: { windowSize?: number };
  F0?: { Tref?: number; z?: number; threshold?: number };
  Vs?: { tankArea?: number };
  PV?: { rpmRef?: number; multiplier?: number };
  Vliquid?: { initialVolume?: number; density?: number };
  CER?: { defaultRQ?: number };
  OTR?: { CStar?: number };
}

export interface CollectorConfig {
  reactorId: string;
  batchId: string | null;
  liquidVolumeL: number;
  sampleIntervalMs?: number;  // 默认1000
  recordIntervalMs?: number;  // 默认60000
  /** 公式系数 (可选, 不传则用默认硬编码值) */
  formulaCoefficients?: FormulaCoefficients;
}

export interface ProcessValues {
  timestamp: string;
  batch_id: string | null;
  temperature: number;     // AI-0 °C
  jacket_temp: number;     // AI-1 °C
  pH: number;              // AI-2
  DO: number;              // AI-3 %
  pressure: number;        // AI-4 bar
  airflow: number;         // AI-5 NL/min
  weight: number;          // AI-6 kg
  rpm: number;
  vfd_current: number;     // A
  steam_cv: number;        // AO-0 %
  cool_cv: number;         // AO-1 %
  air_cv: number;          // AO-2 %
  feed_P01: number;        // mL/h
  feed_P02: number;
  feed_P03: number;
  feed_P04: number;
  temp_mode: number;       // 0保温 1加热 2冷却
}

export interface CalculatedParams {
  timestamp: string;
  batch_id: string;
  OUR: number;       // mmol/L/h 摄氧速率
  CER: number;       // mmol/L/h CO₂释放速率
  RQ: number;        // 无量纲 呼吸商
  OTR: number;       // mmol/L/h 传氧速率
  kLa: number;       // 1/h
  Vs: number;        // m/s 表观气速
  mu: number;        // 1/h 比增长速率估算
  cum_feed: number;  // mL 累积补料
  cum_base: number;  // mL 累积补碱
  cum_acid: number;  // mL 累积补酸
  liquid_volume: number; // L
  F0: number;        // min (仅SIP)
}

export class DataCollector extends EventEmitter {
  private config: CollectorConfig;
  private buffer: ProcessValues[] = [];
  private realtimeTimer: ReturnType<typeof setInterval> | null = null;
  private recordTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  // 注入的数据源
  private readFn: (() => Promise<Record<string, number>>) | null = null;

  // 累积值 (分钟级积分)
  private cumFeed = 0;
  private cumBase = 0;
  private cumAcid = 0;
  private cumF0 = 0;
  private lastOUR = 0;

  // Sliding window for mu calculation (OUR-derivative method)
  // Stores last 5 OUR values (1 per minute → 5-minute window)
  private lastOURValues: { timestamp: number; our: number }[] = [];

  constructor(config: CollectorConfig) {
    super();
    this.config = config;
  }

  setDataSource(fn: () => Promise<Record<string, number>>): void {
    this.readFn = fn;
  }

  setBatch(batchId: string | null, liquidVolumeL?: number): void {
    this.config.batchId = batchId;
    if (liquidVolumeL) this.config.liquidVolumeL = liquidVolumeL;
    this.cumFeed = 0;
    this.cumBase = 0;
    this.cumAcid = 0;
    this.cumF0 = 0;
    this.lastOURValues = [];
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    // 每秒采集 → 实时推送
    this.realtimeTimer = setInterval(() => this.sample(), this.config.sampleIntervalMs ?? 1000);

    // 每分钟聚合 → 写库
    this.recordTimer = setInterval(() => this.record(), this.config.recordIntervalMs ?? 60000);

    this.emit('started');
  }

  stop(): void {
    this.running = false;
    if (this.realtimeTimer) { clearInterval(this.realtimeTimer); this.realtimeTimer = null; }
    if (this.recordTimer) { clearInterval(this.recordTimer); this.recordTimer = null; }
    this.record(); // 写入剩余数据
    this.emit('stopped');
  }

  private async sample(): Promise<void> {
    if (!this.readFn) return;
    try {
      const raw = await this.readFn();
      const pv = this.toPV(raw);
      this.buffer.push(pv);
      // 保留最近120个样本 (2分钟)
      if (this.buffer.length > 120) this.buffer.shift();
      this.emit('pv_realtime', pv);
    } catch (err) {
      this.emit('error', { source: 'sample', error: (err as Error).message });
    }
  }

  private record(): void {
    if (this.buffer.length === 0) return;
    // 无 batchId 时不写入数据库 (避免FK违反)
    if (!this.config.batchId) { this.buffer = []; return; }

    // 取最近一分钟的样本均值
    const recent = this.buffer.splice(0, this.buffer.length);
    const avg = this.average(recent);

    // 计算测算值
    const calc = this.calculate(avg);
    this.emit('record', { pv: avg, calculated: calc });
  }

  private toPV(raw: Record<string, number>): ProcessValues {
    return {
      timestamp: new Date().toISOString(),
      batch_id: this.config.batchId,
      temperature: raw['TEMP_PV'] ?? 0,
      jacket_temp: raw['JACKET_PV'] ?? 0,
      pH: raw['PH_PV'] ?? 0,
      DO: raw['DO_PV'] ?? 0,
      pressure: raw['PRESSURE_PV'] ?? 0,
      airflow: raw['AIRFLOW_PV'] ?? 0,
      weight: raw['WEIGHT_PV'] ?? 0,
      rpm: raw['VFD_ACTUAL_FREQ'] ? Math.round(raw['VFD_ACTUAL_FREQ'] * 24) : 0,
      vfd_current: raw['VFD_CURRENT'] ?? 0,
      steam_cv: raw['STEAM_CV'] ?? 0,
      cool_cv: raw['COOL_CV'] ?? 0,
      air_cv: raw['AIR_CV'] ?? 0,
      feed_P01: raw['P01_RATE'] ?? 0,
      feed_P02: raw['P02_RATE'] ?? 0,
      feed_P03: raw['P03_RATE'] ?? 0,
      feed_P04: raw['P04_RATE'] ?? 0,
      temp_mode: raw['TEMP_MODE'] ?? 0,
    };
  }

  private average(samples: ProcessValues[]): ProcessValues {
    if (samples.length === 1) return samples[0];
    const keys: (keyof ProcessValues)[] = [
      'temperature', 'jacket_temp', 'pH', 'DO', 'pressure', 'airflow', 'weight',
      'rpm', 'vfd_current', 'steam_cv', 'cool_cv', 'air_cv',
      'feed_P01', 'feed_P02', 'feed_P03', 'feed_P04', 'temp_mode',
    ];
    const avg: any = {
      timestamp: new Date().toISOString(),
      batch_id: this.config.batchId,
    };
    for (const k of keys) {
      const vals = samples.map(s => s[k] as number).filter(v => !isNaN(v));
      avg[k] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }
    avg.temp_mode = Math.round(avg.temp_mode);
    return avg;
  }

  /** 获取公式系数 (配置 → 默认值 回退链) */
  private coef<T>(group: keyof FormulaCoefficients, key: string, defaultVal: T): T {
    const fc = this.config.formulaCoefficients;
    if (fc && fc[group] && (fc[group] as any)[key] !== undefined) return (fc[group] as any)[key];
    return defaultVal;
  }

  private calculate(pv: ProcessValues): CalculatedParams {
    const V = this.config.liquidVolumeL;
    const rpm = pv.rpm;
    const airflow = pv.airflow;

    // 表观气速 Vs (m/s) = Q_air / A_cross (系数可配置)
    const tankArea = this.coef('Vs', 'tankArea', 0.02);
    const Vs = airflow > 0 ? (airflow / 1000 / 60) / tankArea : 0;

    // P/V 简化计算 (系数可配置)
    const rpmRef = this.coef('PV', 'rpmRef', 200);
    const pvMul = this.coef('PV', 'multiplier', 0.1);
    const PoverV = rpm > 0 ? Math.pow(rpm / rpmRef, 3) * pvMul : 0;

    // kLa Van't Riet 关联 (系数可配置: C, a, b)
    const C = this.coef('kLa', 'C', 0.026);
    const a = this.coef('kLa', 'a', 0.4);
    const b = this.coef('kLa', 'b', 0.5);
    const kLa = C * Math.pow(PoverV + 0.01, a) * Math.pow(Vs + 0.001, b) * 3600;

    // OUR = kLa × (DO* - DO) / 100 (DO* 可配置)
    const DOStar = this.coef('OUR', 'DOStar', 100);
    const OUR = kLa * (DOStar - pv.DO) / 100;
    this.lastOUR = OUR;

    // CER — CO₂ 释放速率 (无尾气分析仪时用 defaultRQ × OUR 估算)
    const defaultRQ = this.coef('CER', 'defaultRQ', 1.0);
    const CER = OUR * defaultRQ; // 简化: 无尾气数据时 CER = RQ_default × OUR

    // RQ — 呼吸商
    const RQ = OUR > 0.01 ? CER / OUR : 0;

    // OTR — 传氧速率 (= kLa × (DO* - DO) × C*, C* 为饱和溶氧浓度 mmol/L)
    const CStar = this.coef('OTR', 'CStar', 0.21); // ~0.21 mmol/L at 37°C
    const OTR = kLa * (DOStar - pv.DO) / 100 * CStar;

    // μ 比生长速率: OUR 对数导数 (滑窗大小可配置)
    const windowSize = this.coef('mu', 'windowSize', 5);
    const now = Date.now();
    if (OUR > 0) {
      this.lastOURValues.push({ timestamp: now, our: OUR });
    }
    if (this.lastOURValues.length > windowSize) {
      this.lastOURValues = this.lastOURValues.slice(-windowSize);
    }

    let mu = 0;
    if (this.lastOURValues.length >= 2) {
      const oldest = this.lastOURValues[0];
      const newest = this.lastOURValues[this.lastOURValues.length - 1];
      const dtHours = (newest.timestamp - oldest.timestamp) / (1000 * 60 * 60);
      if (dtHours > 0 && oldest.our > 0 && newest.our > 0) {
        mu = (Math.log(newest.our) - Math.log(oldest.our)) / dtHours;
      }
    }

    // 累积值 (每分钟增量)
    this.cumFeed += pv.feed_P02 / 60;
    this.cumBase += pv.feed_P01 / 60;
    this.cumAcid += pv.feed_P04 / 60;

    // F₀ 灭菌值 (参考温度和 z 值可配置)
    const Tref = this.coef('F0', 'Tref', 121);
    const zVal = this.coef('F0', 'z', 10);
    const threshold = this.coef('F0', 'threshold', 100);
    if (pv.temperature >= threshold) {
      this.cumF0 += Math.pow(10, (pv.temperature - Tref) / zVal) / 60;
    }

    // 液体体积
    const initVol = this.coef('Vliquid', 'initialVolume', V);
    const liquidVol = initVol + (this.cumFeed + this.cumBase + this.cumAcid) / 1000;

    return {
      timestamp: new Date().toISOString(),
      batch_id: this.config.batchId || '',
      OUR: Math.round(OUR * 100) / 100,
      CER: Math.round(CER * 100) / 100,
      RQ: Math.round(RQ * 1000) / 1000,
      OTR: Math.round(OTR * 1000) / 1000,
      kLa: Math.round(kLa * 10) / 10,
      Vs: Math.round(Vs * 1000) / 1000,
      mu: Math.round(mu * 1000) / 1000,
      cum_feed: Math.round(this.cumFeed * 10) / 10,
      cum_base: Math.round(this.cumBase * 10) / 10,
      cum_acid: Math.round(this.cumAcid * 10) / 10,
      liquid_volume: Math.round(liquidVol * 100) / 100,
      F0: Math.round(this.cumF0 * 100) / 100,
    };
  }

  isRunning(): boolean { return this.running; }
  getBufferSize(): number { return this.buffer.length; }
}
