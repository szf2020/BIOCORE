/**
 * 生成模拟批次数据 — 一个完整的 E.coli 发酵批次
 * 每分钟一组数据，总共 8 小时 (480 组)
 * 数据写入 SQLite + InfluxDB
 *
 * 用法: npx tsx scripts/generate-mock-batch.ts
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

const BATCH_ID = `BATCH-20260413-001`;
const RECIPE_ID = 'RCP-ECOLI-001';
const RECIPE_VERSION = '1.0.0';
const REACTOR_ID = 'F01';
const OPERATOR_ID = 'admin';
const ORGANISM = 'E. coli BL21';

// 批次开始时间: 今天凌晨 2:00
const BASE_TIME = new Date();
BASE_TIME.setHours(2, 0, 0, 0);

const DURATION_MIN = 480; // 8 小时

// ─── 工具函数 ─────────────────────────────────────────────
function noise(amplitude: number): number {
  return (Math.random() - 0.5) * 2 * amplitude;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// 模拟 S 型生长曲线
function logistic(t: number, L: number, k: number, t0: number): number {
  return L / (1 + Math.exp(-k * (t - t0)));
}

// ─── 生成过程数据 ─────────────────────────────────────────
interface PVRecord {
  timestamp: Date;
  temperature: number;
  jacket_temp: number;
  pH: number;
  DO: number;
  pressure: number;
  airflow: number;
  weight: number;
  rpm: number;
  vfd_current: number;
  steam_cv: number;
  cool_cv: number;
  air_cv: number;
  P01_rate: number; // 碱泵
  P02_rate: number; // 补料泵
  P03_rate: number; // 氮源泵
  P04_rate: number; // 酸泵
  temp_mode: number;
  temp_sv: number;
  pH_sv: number;
  DO_sv: number;
  phase_index: number;
  step_number: number;
}

interface CalcRecord {
  timestamp: Date;
  OUR: number;
  kLa: number;
  mu: number;
  Vs: number;
  V_feed: number;
  V_base: number;
  V_acid: number;
  O2_total: number;
  V_liquid: number;
}

function generateProcessData(): { pvData: PVRecord[]; calcData: CalcRecord[] } {
  const pvData: PVRecord[] = [];
  const calcData: CalcRecord[] = [];

  let cumFeed = 0;
  let cumBase = 0;
  let cumAcid = 0;
  let cumO2 = 0;
  let liquidVolume = 5.0; // 初始 5L

  for (let i = 0; i < DURATION_MIN; i++) {
    const t = i; // 分钟
    const ts = new Date(BASE_TIME.getTime() + t * 60 * 1000);
    const tH = t / 60; // 小时

    // ── Phase 分配 ──
    // 0-30min: 准备 (prepare)
    // 30-60min: 加热 (heating)
    // 60-420min: 发酵 (fermentation) - 主发酵阶段
    // 420-480min: 降温+放料 (discharge)
    let phase_index: number;
    let step_number: number;
    if (t < 30) { phase_index = 0; step_number = Math.min(Math.floor(t / 10), 2); }
    else if (t < 60) { phase_index = 1; step_number = Math.floor((t - 30) / 15); }
    else if (t < 420) { phase_index = 2; step_number = Math.floor((t - 60) / 90); }
    else { phase_index = 3; step_number = Math.floor((t - 420) / 30); }

    // ── 温度 ──
    let temp_sv = 37.0;
    let temperature: number;
    let jacket_temp: number;
    let temp_mode: number;
    let steam_cv: number;
    let cool_cv: number;

    if (t < 30) {
      // 准备阶段: 室温
      temperature = 25 + noise(0.3);
      jacket_temp = 25 + noise(0.5);
      temp_mode = 0;
      temp_sv = 25;
      steam_cv = 0;
      cool_cv = 0;
    } else if (t < 60) {
      // 加热阶段: 25°C → 37°C
      const progress = (t - 30) / 30;
      temperature = 25 + 12 * progress + noise(0.2);
      jacket_temp = temperature + 5 + noise(0.3);
      temp_mode = 1;
      steam_cv = 60 * (1 - progress) + noise(3);
      cool_cv = 0;
    } else if (t < 420) {
      // 发酵阶段: 维持 37°C, 代谢产热需要冷却
      const metabolicHeat = logistic(tH - 1, 0.5, 1.5, 4) * noise(0.1);
      temperature = 37.0 + noise(0.15) + metabolicHeat;
      jacket_temp = temperature - 2 - logistic(tH - 1, 3, 1, 4) + noise(0.2);
      temp_mode = 2;
      steam_cv = 0;
      cool_cv = clamp(20 + logistic(tH - 1, 40, 1.2, 4) + noise(2), 0, 100);
    } else {
      // 降温: 37°C → 4°C
      const progress = (t - 420) / 60;
      temperature = 37 - 33 * progress + noise(0.3);
      jacket_temp = temperature - 8 + noise(0.5);
      temp_mode = 2;
      temp_sv = 4;
      steam_cv = 0;
      cool_cv = clamp(90 + noise(3), 0, 100);
    }

    // ── pH ──
    const pH_sv = 7.0;
    let pH: number;
    let P01_rate: number; // 碱泵
    let P04_rate: number; // 酸泵

    if (t < 60) {
      pH = 7.0 + noise(0.02);
      P01_rate = 0;
      P04_rate = 0;
    } else {
      // 发酵过程中 pH 自然下降 (代谢产酸), 碱泵补碱控制
      const acidDrift = logistic(tH - 1, -0.8, 1.0, 4);
      pH = 7.0 + acidDrift * 0.3 + noise(0.05);
      // 碱泵反应: pH 低于设定值时加碱
      P01_rate = pH < pH_sv ? clamp((pH_sv - pH) * 50 + noise(1), 0, 20) : 0;
      P04_rate = pH > 7.3 ? clamp((pH - 7.3) * 30 + noise(0.5), 0, 10) : 0;
      cumBase += P01_rate / 60; // mL
      cumAcid += P04_rate / 60;
    }

    // ── DO (溶氧) ──
    const DO_sv = 30;
    let DO: number;
    let rpm: number;
    let airflow: number;

    if (t < 60) {
      DO = 95 + noise(2);
      rpm = 200;
      airflow = 2.0 + noise(0.1);
    } else {
      // 随菌体增长, DO 下降, 搅拌和通气提高
      const oxygenDemand = logistic(tH - 1, 1.0, 1.5, 4);
      DO = clamp(95 - oxygenDemand * 70 + noise(3), 5, 100);
      // DO cascade: 搅拌→通气
      rpm = clamp(200 + oxygenDemand * 300 + noise(5), 200, 800);
      airflow = clamp(2.0 + oxygenDemand * 4.0 + noise(0.2), 1.0, 10.0);
    }

    // ── 补料 (fed-batch) ──
    let P02_rate: number; // 补料泵 (葡萄糖)
    let P03_rate: number; // 氮源泵
    if (t < 120) {
      P02_rate = 0;
      P03_rate = 0;
    } else if (t < 420) {
      // 指数补料策略
      const feedTime = (t - 120) / 60; // 补料开始后小时数
      P02_rate = clamp(5 * Math.exp(0.2 * feedTime) + noise(0.5), 0, 50);
      P03_rate = clamp(P02_rate * 0.1 + noise(0.2), 0, 10);
      cumFeed += P02_rate / 60;
      liquidVolume += (P02_rate + P03_rate + P01_rate) / 60 / 1000; // mL→L
    } else {
      P02_rate = 0;
      P03_rate = 0;
    }

    // ── 其他传感器 ──
    const pressure = clamp(0.5 + (airflow - 2) * 0.05 + noise(0.02), 0, 2);
    const weight = liquidVolume * 1.02 + 2.5 + noise(0.05); // 液体重量+罐重
    const vfd_current = clamp(rpm * 0.008 + noise(0.1), 0, 10);
    const air_cv = clamp(airflow / 10 * 100 + noise(2), 0, 100);

    // ── 在 t=250 时注入一个异常 (DO突降, 温度波动) ──
    let finalTemp = temperature;
    let finalDO = DO;
    if (t >= 250 && t <= 260) {
      finalDO = clamp(DO - 15 + noise(3), 2, 100);
      finalTemp = temperature + 0.8 + noise(0.2);
    }

    pvData.push({
      timestamp: ts,
      temperature: +finalTemp.toFixed(2),
      jacket_temp: +jacket_temp.toFixed(2),
      pH: +pH.toFixed(3),
      DO: +finalDO.toFixed(1),
      pressure: +pressure.toFixed(3),
      airflow: +airflow.toFixed(2),
      weight: +weight.toFixed(2),
      rpm: Math.round(rpm),
      vfd_current: +vfd_current.toFixed(2),
      steam_cv: +clamp(steam_cv, 0, 100).toFixed(1),
      cool_cv: +clamp(cool_cv, 0, 100).toFixed(1),
      air_cv: +air_cv.toFixed(1),
      P01_rate: +P01_rate.toFixed(2),
      P02_rate: +P02_rate.toFixed(2),
      P03_rate: +P03_rate.toFixed(2),
      P04_rate: +P04_rate.toFixed(2),
      temp_mode,
      temp_sv,
      pH_sv,
      DO_sv,
      phase_index,
      step_number,
    });

    // ── 计算参数 (每分钟) ──
    if (t >= 60) {
      const oxygenDemand = logistic(tH - 1, 1.0, 1.5, 4);
      const OUR = clamp(oxygenDemand * 25 + noise(1.5), 0, 50);
      const kLa = clamp(50 + rpm * 0.1 + airflow * 5 + noise(3), 10, 200);
      const mu = clamp(logistic(tH - 1, 0.5, 2.0, 3) * (1 - logistic(tH - 1, 0.5, 1.5, 6)) + noise(0.02), 0, 0.8);
      const Vs = clamp(airflow / (3.14159 * 0.06 * 0.06) / 60 + noise(0.001), 0, 0.5);
      cumO2 += OUR / 60;

      calcData.push({
        timestamp: ts,
        OUR: +OUR.toFixed(3),
        kLa: +kLa.toFixed(2),
        mu: +mu.toFixed(4),
        Vs: +Vs.toFixed(4),
        V_feed: +cumFeed.toFixed(1),
        V_base: +cumBase.toFixed(1),
        V_acid: +cumAcid.toFixed(1),
        O2_total: +cumO2.toFixed(1),
        V_liquid: +liquidVolume.toFixed(3),
      });
    }
  }

  return { pvData, calcData };
}

// ─── 离线取样数据 ─────────────────────────────────────────
function generateOfflineSamples(): Array<{
  sample_time: string; elapsed_h: number; od600: number;
  glucose_g_L: number; acetate_g_L: number; product_titer: number;
  biomass_g_L: number; cell_viability_pct: number;
}> {
  const samples = [];
  // 每小时取样一次 (发酵阶段)
  for (let h = 1; h <= 7; h++) {
    const ts = new Date(BASE_TIME.getTime() + (60 + h * 60) * 60 * 1000);
    const growth = logistic(h, 1, 1.5, 3.5);
    samples.push({
      sample_time: ts.toISOString(),
      elapsed_h: h,
      od600: +(0.1 + growth * 35 + noise(1.5)).toFixed(2),
      glucose_g_L: +(20 - growth * 18 + noise(0.5)).toFixed(2),
      acetate_g_L: +(growth * 2.5 + noise(0.3)).toFixed(2),
      product_titer: +(growth * 8.5 + noise(0.5)).toFixed(2),
      biomass_g_L: +(0.05 + growth * 12 + noise(0.5)).toFixed(2),
      cell_viability_pct: +(98 - h * 1.2 + noise(1)).toFixed(1),
    });
  }
  return samples;
}

// ─── 主函数 ───────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  BIOCore 模拟批次数据生成器');
  console.log('═══════════════════════════════════════════');

  // 1. SQLite 初始化
  console.log('\n[1/5] 连接 SQLite...');
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // 确保有默认用户
  const userExists = db.prepare('SELECT 1 FROM users WHERE user_id = ?').get(OPERATOR_ID);
  if (!userExists) {
    console.log('  创建默认用户 admin...');
    db.prepare(`INSERT INTO users (user_id, username, display_name, role, password_hash, is_active)
      VALUES (?, ?, ?, ?, ?, 1)`).run(OPERATOR_ID, 'admin', '管理员', 'admin', 'not-used');
  }

  // 确保有配方
  const recipeExists = db.prepare('SELECT 1 FROM recipes WHERE recipe_id = ? AND version = ?').get(RECIPE_ID, RECIPE_VERSION);
  if (!recipeExists) {
    console.log('  创建模拟配方...');
    db.prepare(`INSERT INTO recipes (recipe_id, version, name, author, target_organism, description, execution_mode, vessel_config, phases_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      RECIPE_ID, RECIPE_VERSION, 'E.coli BL21 高密度发酵', OPERATOR_ID, ORGANISM,
      '大肠杆菌 BL21 fed-batch 高密度发酵工艺',
      'sequential',
      JSON.stringify({ id: 'V01', working_volume_L: 7, total_volume_L: 10 }),
      JSON.stringify([
        { phase_id: 'PREPARE', type: 'prepare', params: {} },
        { phase_id: 'HEATING', type: 'heating', params: { target_temp: 37 } },
        { phase_id: 'FERMENT', type: 'fermentation', params: { duration_h: 6 } },
        { phase_id: 'DISCHARGE', type: 'discharge', params: {} },
      ]),
      'approved'
    );
  }

  // 删除旧的同名批次
  const existingBatch = db.prepare('SELECT 1 FROM batches WHERE batch_id = ?').get(BATCH_ID);
  if (existingBatch) {
    console.log(`  删除旧批次 ${BATCH_ID}...`);
    db.prepare('DELETE FROM offline_samples WHERE batch_id = ?').run(BATCH_ID);
    db.prepare('DELETE FROM ai_suggestions WHERE batch_id = ?').run(BATCH_ID);
    db.prepare('DELETE FROM batches WHERE batch_id = ?').run(BATCH_ID);
  }

  // 创建批次
  console.log(`  创建批次 ${BATCH_ID}...`);
  db.prepare(`INSERT INTO batches (batch_id, recipe_id, recipe_version, reactor_id, organism, operator_id,
    started_at, ended_at, current_state, current_phase_index, total_phases, outcome)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'complete', 3, 4, 'success')`).run(
    BATCH_ID, RECIPE_ID, RECIPE_VERSION, REACTOR_ID, ORGANISM, OPERATOR_ID,
    BASE_TIME.toISOString(),
    new Date(BASE_TIME.getTime() + DURATION_MIN * 60 * 1000).toISOString(),
  );

  // 2. 生成过程数据
  console.log('\n[2/5] 生成过程数据 (480 组, 每分钟一组)...');
  const { pvData, calcData } = generateProcessData();
  console.log(`  过程值: ${pvData.length} 组`);
  console.log(`  计算参数: ${calcData.length} 组`);

  // 3. 写入 InfluxDB
  console.log('\n[3/5] 写入 InfluxDB...');
  const influxClient = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN });
  const writeApi = influxClient.getWriteApi(INFLUX_ORG, INFLUX_BUCKET, 's');

  let pvCount = 0;
  for (const pv of pvData) {
    const point = new Point('process_data')
      .tag('batch_id', BATCH_ID)
      .tag('reactor_id', REACTOR_ID)
      .floatField('temperature', pv.temperature)
      .floatField('jacket_temp', pv.jacket_temp)
      .floatField('pH', pv.pH)
      .floatField('DO', pv.DO)
      .floatField('pressure', pv.pressure)
      .floatField('airflow', pv.airflow)
      .floatField('weight', pv.weight)
      .intField('rpm', pv.rpm)
      .floatField('vfd_current', pv.vfd_current)
      .floatField('steam_valve', pv.steam_cv)
      .floatField('cool_valve', pv.cool_cv)
      .floatField('air_valve', pv.air_cv)
      .floatField('feed_rate_P01', pv.P01_rate)
      .floatField('feed_rate_P02', pv.P02_rate)
      .floatField('feed_rate_P03', pv.P03_rate)
      .floatField('feed_rate_P04', pv.P04_rate)
      .intField('temp_mode', pv.temp_mode)
      .floatField('temp_sv', pv.temp_sv)
      .floatField('pH_sv', pv.pH_sv)
      .floatField('DO_sv', pv.DO_sv)
      .intField('phase_index', pv.phase_index)
      .intField('step_number', pv.step_number)
      .timestamp(pv.timestamp);
    writeApi.writePoint(point);
    pvCount++;
  }
  console.log(`  process_data: ${pvCount} 点`);

  let calcCount = 0;
  for (const cp of calcData) {
    const point = new Point('calculated_params')
      .tag('batch_id', BATCH_ID)
      .tag('reactor_id', REACTOR_ID)
      .floatField('OUR', cp.OUR)
      .floatField('kLa', cp.kLa)
      .floatField('mu', cp.mu)
      .floatField('Vs', cp.Vs)
      .floatField('V_feed', cp.V_feed)
      .floatField('V_base', cp.V_base)
      .floatField('V_acid', cp.V_acid)
      .floatField('O2_total', cp.O2_total)
      .floatField('V_liquid', cp.V_liquid)
      .timestamp(cp.timestamp);
    writeApi.writePoint(point);
    calcCount++;
  }
  console.log(`  calculated_params: ${calcCount} 点`);

  try {
    await writeApi.flush();
    console.log('  InfluxDB 写入完成 ✓');
  } catch (e) {
    console.error('  InfluxDB 写入失败:', (e as Error).message);
  }

  // 4. 离线取样
  console.log('\n[4/5] 写入离线取样数据...');
  const samples = generateOfflineSamples();
  const insertSample = db.prepare(`INSERT INTO offline_samples
    (batch_id, sample_time, elapsed_h, od600, glucose_g_L, acetate_g_L, product_titer, product_unit, biomass_g_L, cell_viability_pct, sampled_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'g/L', ?, ?, ?)`);
  for (const s of samples) {
    insertSample.run(BATCH_ID, s.sample_time, s.elapsed_h, s.od600, s.glucose_g_L, s.acetate_g_L, s.product_titer, s.biomass_g_L, s.cell_viability_pct, OPERATOR_ID);
  }
  console.log(`  离线取样: ${samples.length} 条`);

  // 5. AI 建议
  console.log('\n[5/5] 写入 AI 建议...');
  const insertSuggestion = db.prepare(`INSERT INTO ai_suggestions
    (batch_id, suggestion_type, source_module, target_param, current_value, suggested_value, confidence, reasoning, status, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const suggestions = [
    { type: 'param_adjust', source: 'cusum_anomaly', param: 'DO_sv', current: 30, suggested: 35, confidence: 0.82,
      reason: 'CUSUM 检测到 DO 持续偏低 (累积偏差 -4.2σ), 建议提高 DO 设定值至 35%', status: 'accepted' },
    { type: 'param_adjust', source: 'threshold_check', param: 'rpm', current: 450, suggested: 500, confidence: 0.75,
      reason: '当前 DO 为 18.5%, 低于设定值 30%, 搅拌转速提升可增加 kLa', status: 'accepted' },
    { type: 'feed_adjust', source: 'feed_advisor', param: 'feed_rate_P02', current: 15.2, suggested: 18.0, confidence: 0.88,
      reason: '基于软测量模型预测, 当前比生长速率 μ=0.35/h, 可适当增加补料速率', status: 'pending' },
    { type: 'param_adjust', source: 'threshold_check', param: 'airflow', current: 4.5, suggested: 5.5, confidence: 0.70,
      reason: '表观气速 Vs=0.015 m/s, 建议提高通气量以改善传质', status: 'rejected' },
  ];

  const expiresAt = new Date(BASE_TIME.getTime() + 10 * 60 * 60 * 1000).toISOString();
  for (const s of suggestions) {
    insertSuggestion.run(BATCH_ID, s.type, s.source, s.param, s.current, s.suggested, s.confidence, s.reason, s.status, expiresAt);
  }
  console.log(`  AI 建议: ${suggestions.length} 条`);

  // 关闭
  await writeApi.close();
  db.close();

  console.log('\n═══════════════════════════════════════════');
  console.log('  数据生成完成!');
  console.log(`  批次: ${BATCH_ID}`);
  console.log(`  时间范围: ${BASE_TIME.toISOString()} ~ ${new Date(BASE_TIME.getTime() + DURATION_MIN * 60 * 1000).toISOString()}`);
  console.log(`  过程值: ${pvData.length} 组 (每分钟)`);
  console.log(`  计算参数: ${calcData.length} 组`);
  console.log(`  离线取样: ${samples.length} 条`);
  console.log(`  AI 建议: ${suggestions.length} 条`);
  console.log('═══════════════════════════════════════════');
}

main().catch(e => {
  console.error('生成失败:', e);
  process.exit(1);
});
