/**
 * 生成 10 个 CUSUM 演示批次 — 每个批次展示不同的异常模式
 * 用法: npx tsx src/generate-cusum-demo.ts
 *
 * 批次设计:
 *  1. 完美批次 — 无异常, CUSUM 始终低于阈值 (对照组)
 *  2. 温度缓慢漂移 — S⁺ 缓慢上升, 展示 CUSUM 早期检测小偏移
 *  3. pH 突变 — pH 突然下降 0.3, S⁻ 急剧上升
 *  4. DO 周期性波动 — 溶氧振荡, CUSUM 累积后触发
 *  5. 多参数同时漂移 — 温度+pH+DO 同时偏移
 *  6. 温度阶跃 — 冷却水故障, 温度上升 2°C 后恢复
 *  7. pH 渐进酸化 — 代谢产酸未及时补碱, S⁻ 持续上升
 *  8. DO 骤降 — 空气管堵塞, DO 急剧下降
 *  9. 边界批次 — CUSUM 接近阈值但未越过 (灵敏度验证)
 * 10. 灾难批次 — 多次异常, 最终停止发酵
 */

import Database from 'better-sqlite3';
import { InfluxDB, Point } from '@influxdata/influxdb-client';
import { resolve } from 'path';

// ─── 配置 ─────────────────────────────────────────────────
const DB_PATH = resolve(__dirname, '../data/biocore.db');
const INFLUX_URL = process.env.INFLUX_URL || 'http://localhost:8086';
const INFLUX_TOKEN = process.env.INFLUX_TOKEN || 'RNmJ-QDk6PnZKkx2fKoUpZpmFhUdnjoTVl4PHxTLQt2Pkoc-980E7_nRt776wFNgeLLLGNRkN5qIXCYvl3ERVw==';
const INFLUX_ORG = process.env.INFLUX_ORG || 'BIOCore';
const INFLUX_BUCKET = process.env.INFLUX_BUCKET || 'BIOCore_Data';
const RECIPE_ID = 'RCP-ECOLI-001';
const RECIPE_VERSION = '1.0.0';
const REACTOR_ID = 'Reactor-1';

// ─── 工具函数 ─────────────────────────────────────────────
function noise(a: number) { return (Math.random() - 0.5) * 2 * a; }
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function logistic(t: number, L: number, k: number, t0: number) { return L / (1 + Math.exp(-k * (t - t0))); }

// ─── CUSUM 基线 (与后端 cusum-routes.ts DEFAULT_BASELINES 一致) ───
const BASELINES = {
  temperature: { mean: 37.0, std: 0.5 },
  pH:          { mean: 7.0,  std: 0.1 },
  DO:          { mean: 30.0, std: 10.0 },
  pressure:    { mean: 0.5,  std: 0.05 },
  rpm:         { mean: 200,  std: 20 },
};
const CUSUM_H = 5;  // 报警阈值
const CUSUM_K = 0.5; // 漂移容许

// CUSUM 离线计算器 (与 ai-analytics/src/cusum.ts 一致)
class OfflineCUSUM {
  private cumPos = 0;
  private cumNeg = 0;
  constructor(private mean: number, private std: number, private h: number, private k: number) {}

  detect(value: number) {
    const z = (value - this.mean) / this.std;
    this.cumPos = Math.max(0, this.cumPos + z - this.k);
    this.cumNeg = Math.max(0, this.cumNeg - z - this.k);
    const anomaly = this.cumPos > this.h || this.cumNeg > this.h;
    return { anomaly, cumPos: this.cumPos, cumNeg: this.cumNeg, normalized: z };
  }
  reset() { this.cumPos = 0; this.cumNeg = 0; }
}

// ─── 异常注入函数 ─────────────────────────────────────────
type AnomalyFn = (tMin: number, fermStart: number, fermEnd: number) => {
  tempBias: number; phBias: number; doBias: number; rpmBias: number; pressureBias: number;
};

// 1. 完美批次 — 无异常
const noAnomaly: AnomalyFn = () => ({ tempBias: 0, phBias: 0, doBias: 0, rpmBias: 0, pressureBias: 0 });

// 2. 温度缓慢漂移 — 从发酵 2h 开始, 温度以 0.1°C/h 上升
const tempSlowDrift: AnomalyFn = (tMin, fermStart) => {
  const fermMin = tMin - fermStart;
  if (fermMin < 120) return { tempBias: 0, phBias: 0, doBias: 0, rpmBias: 0, pressureBias: 0 };
  const driftH = (fermMin - 120) / 60;
  return { tempBias: 0.1 * driftH, phBias: 0, doBias: 0, rpmBias: 0, pressureBias: 0 };
};

// 3. pH 突变 — 发酵 3h 时 pH 突降 0.3
const phSuddenDrop: AnomalyFn = (tMin, fermStart) => {
  const fermMin = tMin - fermStart;
  if (fermMin >= 180 && fermMin <= 210) {
    return { tempBias: 0, phBias: -0.3, doBias: 0, rpmBias: 0, pressureBias: 0 };
  }
  return { tempBias: 0, phBias: 0, doBias: 0, rpmBias: 0, pressureBias: 0 };
};

// 4. DO 周期性波动 — 溶氧以 15min 为周期振荡 ±8%
const doOscillation: AnomalyFn = (tMin, fermStart) => {
  const fermMin = tMin - fermStart;
  if (fermMin < 60) return { tempBias: 0, phBias: 0, doBias: 0, rpmBias: 0, pressureBias: 0 };
  const doBias = 8 * Math.sin(2 * Math.PI * fermMin / 15);
  return { tempBias: 0, phBias: 0, doBias, rpmBias: 0, pressureBias: 0 };
};

// 5. 多参数同时漂移 — 发酵 2.5h 后温度+0.5, pH-0.1, DO-5
const multiDrift: AnomalyFn = (tMin, fermStart) => {
  const fermMin = tMin - fermStart;
  if (fermMin < 150) return { tempBias: 0, phBias: 0, doBias: 0, rpmBias: 0, pressureBias: 0 };
  const progress = Math.min(1, (fermMin - 150) / 60); // 1小时内渐变到位
  return { tempBias: 0.5 * progress, phBias: -0.1 * progress, doBias: -5 * progress, rpmBias: 0, pressureBias: 0 };
};

// 6. 温度阶跃 — 冷却水故障 20min, 温度+2°C 后恢复
const tempStepUp: AnomalyFn = (tMin, fermStart) => {
  const fermMin = tMin - fermStart;
  if (fermMin >= 200 && fermMin < 220) {
    return { tempBias: 2.0, phBias: 0, doBias: 0, rpmBias: 0, pressureBias: 0 };
  }
  return { tempBias: 0, phBias: 0, doBias: 0, rpmBias: 0, pressureBias: 0 };
};

// 7. pH 渐进酸化 — 从发酵 1h 开始, pH 以 0.02/h 持续下降
const phGradualAcid: AnomalyFn = (tMin, fermStart) => {
  const fermMin = tMin - fermStart;
  if (fermMin < 60) return { tempBias: 0, phBias: 0, doBias: 0, rpmBias: 0, pressureBias: 0 };
  const driftH = (fermMin - 60) / 60;
  return { tempBias: 0, phBias: -0.02 * driftH, doBias: 0, rpmBias: 0, pressureBias: 0 };
};

// 8. DO 骤降 — 空气管堵塞, DO 急剧下降 30%
const doCrash: AnomalyFn = (tMin, fermStart) => {
  const fermMin = tMin - fermStart;
  if (fermMin >= 240 && fermMin < 255) {
    const severity = Math.min(1, (fermMin - 240) / 5); // 5min 内降到最低
    return { tempBias: 0, phBias: 0, doBias: -30 * severity, rpmBias: 0, pressureBias: -0.15 };
  }
  if (fermMin >= 255 && fermMin < 280) {
    const recovery = (fermMin - 255) / 25;
    return { tempBias: 0, phBias: 0, doBias: -30 * (1 - recovery), rpmBias: 0, pressureBias: -0.15 * (1 - recovery) };
  }
  return { tempBias: 0, phBias: 0, doBias: 0, rpmBias: 0, pressureBias: 0 };
};

// 9. 边界批次 — 温度微小漂移 +0.15°C, CUSUM 接近阈值但不触发
const borderline: AnomalyFn = (tMin, fermStart) => {
  const fermMin = tMin - fermStart;
  if (fermMin < 90) return { tempBias: 0, phBias: 0, doBias: 0, rpmBias: 0, pressureBias: 0 };
  return { tempBias: 0.15, phBias: 0, doBias: 0, rpmBias: 0, pressureBias: 0 };
};

// 10. 灾难批次 — 多次异常叠加
const catastrophic: AnomalyFn = (tMin, fermStart) => {
  const fermMin = tMin - fermStart;
  let tempBias = 0, phBias = 0, doBias = 0;
  // 第一次: 120min 温度波动
  if (fermMin >= 120 && fermMin < 140) tempBias = 1.5;
  // 第二次: 200min pH 崩溃
  if (fermMin >= 200 && fermMin < 230) phBias = -0.4;
  // 第三次: 280min DO 骤降 (最终停止)
  if (fermMin >= 280) {
    doBias = -20 * Math.min(1, (fermMin - 280) / 10);
    tempBias = 1.0;
  }
  return { tempBias, phBias, doBias, rpmBias: 0, pressureBias: 0 };
};

// ─── 10 个批次定义 ────────────────────────────────────────
interface BatchDef {
  id: string;
  day: number;       // 相对今天的偏移天数
  durationH: number;
  outcome: string;
  label: string;     // 中文描述
  anomaly: AnomalyFn;
}

const BATCHES: BatchDef[] = [
  { id: 'CUSUM-DEMO-001', day: -10, durationH: 8,  outcome: 'success', label: '完美批次 (对照组)',         anomaly: noAnomaly },
  { id: 'CUSUM-DEMO-002', day: -9,  durationH: 10, outcome: 'success', label: '温度缓慢漂移 (+0.1°C/h)', anomaly: tempSlowDrift },
  { id: 'CUSUM-DEMO-003', day: -8,  durationH: 8,  outcome: 'success', label: 'pH 突变 (-0.3)',          anomaly: phSuddenDrop },
  { id: 'CUSUM-DEMO-004', day: -7,  durationH: 9,  outcome: 'success', label: 'DO 周期性波动 (±8%)',     anomaly: doOscillation },
  { id: 'CUSUM-DEMO-005', day: -6,  durationH: 8,  outcome: 'partial', label: '多参数同时漂移',          anomaly: multiDrift },
  { id: 'CUSUM-DEMO-006', day: -5,  durationH: 8,  outcome: 'success', label: '温度阶跃 (+2°C, 20min)', anomaly: tempStepUp },
  { id: 'CUSUM-DEMO-007', day: -4,  durationH: 10, outcome: 'partial', label: 'pH 渐进酸化 (-0.02/h)',   anomaly: phGradualAcid },
  { id: 'CUSUM-DEMO-008', day: -3,  durationH: 8,  outcome: 'success', label: 'DO 骤降 (空气管堵塞)',    anomaly: doCrash },
  { id: 'CUSUM-DEMO-009', day: -2,  durationH: 9,  outcome: 'success', label: '边界批次 (接近阈值)',     anomaly: borderline },
  { id: 'CUSUM-DEMO-010', day: -1,  durationH: 6,  outcome: 'failed',  label: '灾难批次 (多次异常)',     anomaly: catastrophic },
];

// ─── 主函数 ───────────────────────────────────────────────
async function main() {
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║   BIOCore CUSUM 演示数据生成器 (10 批次)      ║');
  console.log('╚═══════════════════════════════════════════════╝');
  console.log();

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const userRow = db.prepare('SELECT user_id FROM users LIMIT 1').get() as any;
  const operatorId = userRow?.user_id || 'admin';

  const influxClient = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN });
  const writeApi = influxClient.getWriteApi(INFLUX_ORG, INFLUX_BUCKET, 's');

  const insertSample = db.prepare(`INSERT INTO offline_samples
    (batch_id, sample_time, elapsed_h, od600, glucose_g_L, acetate_g_L, product_titer, product_unit, biomass_g_L, cell_viability_pct, sampled_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'g/L', ?, ?, ?)`);

  const insertSuggestion = db.prepare(`INSERT INTO ai_suggestions
    (batch_id, suggestion_type, source_module, target_param, current_value, suggested_value, confidence, reasoning, status, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  // 检查 cusum_results 表是否存在, 不存在则创建 (存储离线 CUSUM 计算结果)
  db.exec(`CREATE TABLE IF NOT EXISTS cusum_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    minute INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    raw_value REAL NOT NULL,
    normalized REAL NOT NULL,
    cum_pos REAL NOT NULL,
    cum_neg REAL NOT NULL,
    anomaly INTEGER NOT NULL DEFAULT 0,
    UNIQUE(batch_id, channel, minute)
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cusum_results_batch ON cusum_results(batch_id)`);

  const insertCusum = db.prepare(`INSERT OR REPLACE INTO cusum_results
    (batch_id, channel, minute, timestamp, raw_value, normalized, cum_pos, cum_neg, anomaly)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  for (const batch of BATCHES) {
    const baseTime = new Date();
    baseTime.setDate(baseTime.getDate() + batch.day);
    baseTime.setHours(2, 0, 0, 0);
    const durationMin = batch.durationH * 60;
    const endTime = new Date(baseTime.getTime() + durationMin * 60 * 1000);
    const fermStart = 60; // 发酵阶段从 60min 开始
    const fermEnd = durationMin - 60;

    // 清理旧数据
    db.prepare('DELETE FROM cusum_results WHERE batch_id = ?').run(batch.id);
    db.prepare('DELETE FROM offline_samples WHERE batch_id = ?').run(batch.id);
    db.prepare('DELETE FROM ai_suggestions WHERE batch_id = ?').run(batch.id);
    db.prepare('DELETE FROM batches WHERE batch_id = ?').run(batch.id);

    // 创建批次
    db.prepare(`INSERT INTO batches (batch_id, recipe_id, recipe_version, reactor_id, organism, operator_id,
      started_at, ended_at, current_state, current_phase_index, total_phases, outcome, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'complete', 3, 4, ?, ?)`).run(
      batch.id, RECIPE_ID, RECIPE_VERSION, REACTOR_ID, 'E. coli BL21', operatorId,
      baseTime.toISOString(), endTime.toISOString(), batch.outcome, `CUSUM演示: ${batch.label}`,
    );

    // 初始化离线 CUSUM 检测器 (5通道)
    const cusumDetectors: Record<string, OfflineCUSUM> = {};
    for (const [ch, bl] of Object.entries(BASELINES)) {
      cusumDetectors[ch] = new OfflineCUSUM(bl.mean, bl.std, CUSUM_H, CUSUM_K);
    }

    let cumFeed = 0, cumBase = 0, cumAcid = 0, cumO2 = 0, liquidVolume = 5.0;
    let pvCount = 0, cusumCount = 0;
    let anomalyDetected = false;

    const cusumInsertBatch = db.transaction((rows: any[]) => {
      for (const r of rows) insertCusum.run(...r);
    });
    const cusumRows: any[] = [];

    for (let i = 0; i < durationMin; i++) {
      const ts = new Date(baseTime.getTime() + i * 60 * 1000);
      const tH = i / 60;

      // Phase
      const prepEnd = 30, heatEnd = 60;
      let phase_index: number, step_number: number;
      if (i < prepEnd) { phase_index = 0; step_number = Math.floor(i / 10); }
      else if (i < heatEnd) { phase_index = 1; step_number = Math.floor((i - prepEnd) / 15); }
      else if (i < fermEnd) { phase_index = 2; step_number = Math.floor((i - heatEnd) / 90); }
      else { phase_index = 3; step_number = Math.floor((i - fermEnd) / 30); }

      // 获取异常偏置
      const bias = batch.anomaly(i, fermStart, fermEnd);

      // ── 温度 ──
      let temperature: number, jacket_temp: number, temp_mode: number, steam_cv: number, cool_cv: number;
      if (i < prepEnd) {
        temperature = 25 + noise(0.3); jacket_temp = 25 + noise(0.5);
        temp_mode = 0; steam_cv = 0; cool_cv = 0;
      } else if (i < heatEnd) {
        const p = (i - prepEnd) / (heatEnd - prepEnd);
        temperature = 25 + 12 * p + noise(0.2);
        jacket_temp = temperature + 5 + noise(0.3);
        temp_mode = 1; steam_cv = clamp(60 * (1 - p) + noise(3), 0, 100); cool_cv = 0;
      } else if (i < fermEnd) {
        const heat = logistic(tH - 1, 0.5, 1.5, batch.durationH * 0.5) * 0.1;
        temperature = 37.0 + noise(0.15) + heat + bias.tempBias;
        jacket_temp = temperature - 2 - logistic(tH - 1, 3, 1, batch.durationH * 0.5) + noise(0.2);
        temp_mode = 2; steam_cv = 0;
        cool_cv = clamp(20 + logistic(tH - 1, 40, 1.2, batch.durationH * 0.5) + noise(2), 0, 100);
      } else {
        const p = (i - fermEnd) / 60;
        temperature = 37 - 33 * p + noise(0.3);
        jacket_temp = temperature - 8 + noise(0.5);
        temp_mode = 2; steam_cv = 0; cool_cv = clamp(90 + noise(3), 0, 100);
      }

      // ── pH ──
      let pH: number, P01_rate: number, P04_rate: number;
      if (i < heatEnd) {
        pH = 7.0 + noise(0.02); P01_rate = 0; P04_rate = 0;
      } else {
        const drift = logistic(tH - 1, -0.8, 1.0, batch.durationH * 0.5);
        pH = 7.0 + drift * 0.3 + noise(0.03) + bias.phBias;
        P01_rate = pH < 7.0 ? clamp((7.0 - pH) * 50 + noise(1), 0, 20) : 0;
        P04_rate = pH > 7.3 ? clamp((pH - 7.3) * 30, 0, 10) : 0;
        cumBase += P01_rate / 60; cumAcid += P04_rate / 60;
      }

      // ── DO ──
      let DO: number, rpm: number, airflow: number;
      if (i < heatEnd) {
        DO = 95 + noise(2); rpm = 200; airflow = 2 + noise(0.1);
      } else {
        const demand = logistic(tH - 1, 1.0, 1.5, batch.durationH * 0.5);
        DO = clamp(95 - demand * 65 + noise(3) + bias.doBias, 2, 100);
        rpm = clamp(200 + demand * 300 + noise(5) + bias.rpmBias, 200, 800);
        airflow = clamp(2 + demand * 4 + noise(0.2), 1, 10);
      }

      // ── 补料 ──
      const feedStartMin = 2 * 60 + heatEnd;
      let P02_rate: number, P03_rate: number;
      if (i < feedStartMin || i >= fermEnd) {
        P02_rate = 0; P03_rate = 0;
      } else {
        const ft = (i - feedStartMin) / 60;
        P02_rate = clamp(5 * Math.exp(0.2 * ft) + noise(0.5), 0, 50);
        P03_rate = clamp(P02_rate * 0.1 + noise(0.2), 0, 10);
        cumFeed += P02_rate / 60;
        liquidVolume += (P02_rate + P03_rate + P01_rate) / 60 / 1000;
      }

      const pressure = clamp(0.5 + (airflow - 2) * 0.05 + noise(0.02) + bias.pressureBias, 0, 2);
      const weight = liquidVolume * 1.02 + 2.5 + noise(0.05);
      const vfd_current = clamp(rpm * 0.008 + noise(0.1), 0, 10);
      const air_cv = clamp(airflow / 10 * 100 + noise(2), 0, 100);

      // ── 写入 InfluxDB ──
      const pvPoint = new Point('process_data')
        .tag('batch_id', batch.id).tag('reactor_id', REACTOR_ID)
        .floatField('temperature', +temperature.toFixed(2))
        .floatField('jacket_temp', +jacket_temp.toFixed(2))
        .floatField('pH', +pH.toFixed(3))
        .floatField('DO', +DO.toFixed(1))
        .floatField('pressure', +pressure.toFixed(3))
        .floatField('airflow', +airflow.toFixed(2))
        .floatField('weight', +weight.toFixed(2))
        // 注意: rpm 字段跳过写入, 因 InfluxDB 中存在 int/float 类型冲突
        .floatField('vfd_current', +vfd_current.toFixed(2))
        .floatField('steam_valve', +clamp(steam_cv, 0, 100).toFixed(1))
        .floatField('cool_valve', +clamp(cool_cv, 0, 100).toFixed(1))
        .floatField('air_valve', +air_cv.toFixed(1))
        .floatField('feed_rate_P01', +P01_rate.toFixed(2))
        .floatField('feed_rate_P02', +P02_rate.toFixed(2))
        .floatField('feed_rate_P03', +P03_rate.toFixed(2))
        .floatField('feed_rate_P04', +P04_rate.toFixed(2))
        .intField('temp_mode', temp_mode)
        .floatField('temp_sv', 37)
        .floatField('pH_sv', 7.0)
        .floatField('DO_sv', 30)
        .intField('phase_index', phase_index)
        .intField('step_number', step_number)
        .timestamp(ts);
      writeApi.writePoint(pvPoint);
      pvCount++;

      // ── 计算参数 (发酵阶段) ──
      if (i >= heatEnd) {
        const demand = logistic(tH - 1, 1.0, 1.5, batch.durationH * 0.5);
        const OUR = clamp(demand * 25 + noise(1.5), 0, 50);
        const kLa = clamp(50 + rpm * 0.1 + airflow * 5 + noise(3), 10, 200);
        const mu = clamp(logistic(tH - 1, 0.5, 2.0, batch.durationH * 0.4) *
          (1 - logistic(tH - 1, 0.5, 1.5, batch.durationH * 0.75)) + noise(0.02), 0, 0.8);
        const Vs = clamp(airflow / (3.14159 * 0.06 * 0.06) / 60 + noise(0.001), 0, 0.5);
        cumO2 += OUR / 60;

        const cpPoint = new Point('calculated_params')
          .tag('batch_id', batch.id).tag('reactor_id', REACTOR_ID)
          .floatField('OUR', +OUR.toFixed(3))
          .floatField('kLa', +kLa.toFixed(2))
          .floatField('mu', +mu.toFixed(4))
          .floatField('Vs', +Vs.toFixed(4))
          .floatField('V_feed', +cumFeed.toFixed(1))
          .floatField('V_base', +cumBase.toFixed(1))
          .floatField('V_acid', +cumAcid.toFixed(1))
          .floatField('O2_total', +cumO2.toFixed(1))
          .floatField('V_liquid', +liquidVolume.toFixed(3))
          .timestamp(ts);
        writeApi.writePoint(cpPoint);
      }

      // ── 离线 CUSUM 计算 (仅发酵阶段) ──
      if (i >= heatEnd && i < fermEnd) {
        const pvMap: Record<string, number> = {
          temperature, pH, DO, pressure, rpm,
        };
        for (const [ch, detector] of Object.entries(cusumDetectors)) {
          const val = pvMap[ch];
          if (val === undefined) continue;
          const r = detector.detect(val);
          if (r.anomaly) anomalyDetected = true;
          cusumRows.push([
            batch.id, ch, i, ts.toISOString(), +val.toFixed(3),
            +r.normalized.toFixed(3), +r.cumPos.toFixed(3), +r.cumNeg.toFixed(3), r.anomaly ? 1 : 0,
          ]);
          cusumCount++;
        }
      }
    }

    // 批量写入 CUSUM 结果
    cusumInsertBatch(cusumRows);

    // 离线取样
    const fermHours = Math.floor((durationMin - 120) / 60);
    for (let h = 1; h <= fermHours; h++) {
      const sampleTs = new Date(baseTime.getTime() + (60 + h * 60) * 60 * 1000);
      const growth = logistic(h, 1, 1.5, fermHours * 0.5);
      insertSample.run(
        batch.id, sampleTs.toISOString(), h,
        +(0.1 + growth * 35 + noise(1.5)).toFixed(2),
        +(20 - growth * 18 + noise(0.5)).toFixed(2),
        +(growth * 2.5 + noise(0.3)).toFixed(2),
        +(growth * 8.5 + noise(0.5)).toFixed(2),
        +(0.05 + growth * 12 + noise(0.5)).toFixed(2),
        +(98 - h * 1.2 + noise(1)).toFixed(1),
        operatorId,
      );
    }

    // AI 建议 (基于 CUSUM 检测结果)
    const expiresAt = endTime.toISOString();
    if (anomalyDetected) {
      insertSuggestion.run(batch.id, 'param_adjust', 'cusum_anomaly', 'DO_sv',
        30, 35, 0.82, `CUSUM 检测到异常偏移 (${batch.label}), 建议调整参数`, 'pending', expiresAt);
    }
    insertSuggestion.run(batch.id, 'feed_adjust', 'feed_advisor', 'feed_rate_P02',
      15, 18, 0.85, '基于软测量预测, 可适当增加补料速率',
      batch.outcome === 'success' ? 'accepted' : 'rejected', expiresAt);

    // 重置
    cumFeed = 0; cumBase = 0; cumAcid = 0; cumO2 = 0; liquidVolume = 5.0;

    // 统计 CUSUM 报警次数
    const alarmCount = cusumRows.filter(r => r[8] === 1).length;
    const alarmChannels = [...new Set(cusumRows.filter(r => r[8] === 1).map(r => r[1]))];

    console.log(`  ✓ ${batch.id}  ${batch.durationH}h  ${batch.outcome.padEnd(7)}  PV:${pvCount}  CUSUM:${cusumCount}  报警:${alarmCount} ${alarmChannels.length > 0 ? `[${alarmChannels.join(',')}]` : ''}`);
    console.log(`    └─ ${batch.label}`);
    pvCount = 0; cusumCount = 0;
  }

  // Flush InfluxDB
  console.log('\n  写入 InfluxDB...');
  try {
    await writeApi.flush();
    console.log('  InfluxDB 写入完成 ✓');
  } catch (e) {
    console.error('  InfluxDB 写入失败:', (e as Error).message);
  }
  await writeApi.close();
  db.close();

  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║   10 个 CUSUM 演示批次生成完成!               ║');
  console.log('║                                               ║');
  console.log('║   查看方式:                                   ║');
  console.log('║   1. 批次列表: /batches                       ║');
  console.log('║   2. 趋势分析: /trends                        ║');
  console.log('║   3. SPC 控制图: /analysis/spc                ║');
  console.log('║   4. CUSUM 历史: GET /api/cusum/:batchId/history ║');
  console.log('╚═══════════════════════════════════════════════╝');
}

main().catch(e => { console.error('失败:', e); process.exit(1); });
