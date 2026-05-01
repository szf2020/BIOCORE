/**
 * 生成 9 个额外模拟批次 — 不同工艺参数和结果
 * 用法: npx tsx src/generate-multi-batch.ts
 */

import Database from 'better-sqlite3';
import { InfluxDB, Point } from '@influxdata/influxdb-client';
import { resolve } from 'path';

const DB_PATH = resolve(__dirname, '../data/biocore.db');
const INFLUX_URL = process.env.INFLUX_URL || 'http://localhost:8086';
const INFLUX_TOKEN = process.env.INFLUX_TOKEN || 'RNmJ-QDk6PnZKkx2fKoUpZpmFhUdnjoTVl4PHxTLQt2Pkoc-980E7_nRt776wFNgeLLLGNRkN5qIXCYvl3ERVw==';
const INFLUX_ORG = process.env.INFLUX_ORG || 'BIOCore';
const INFLUX_BUCKET = process.env.INFLUX_BUCKET || 'BIOCore_Data';
const RECIPE_ID = 'RCP-ECOLI-001';
const RECIPE_VERSION = '1.0.0';
const REACTOR_ID = 'F01';

function noise(a: number) { return (Math.random() - 0.5) * 2 * a; }
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function logistic(t: number, L: number, k: number, t0: number) { return L / (1 + Math.exp(-k * (t - t0))); }

// 9 个批次的变化参数
const BATCHES = [
  { id: 'BATCH-20260407-001', day: -6, tempSv: 37, phSv: 7.0, doSv: 30, durationH: 8, outcome: 'success',   feedStart: 2, muMax: 0.50, anomalyMin: -1 },
  { id: 'BATCH-20260408-001', day: -5, tempSv: 37, phSv: 6.8, doSv: 25, durationH: 10, outcome: 'success',  feedStart: 2, muMax: 0.45, anomalyMin: 350 },
  { id: 'BATCH-20260409-001', day: -4, tempSv: 30, phSv: 7.0, doSv: 40, durationH: 12, outcome: 'success',  feedStart: 3, muMax: 0.35, anomalyMin: -1 },
  { id: 'BATCH-20260409-002', day: -4, tempSv: 37, phSv: 7.2, doSv: 30, durationH: 6, outcome: 'failed',    feedStart: 1.5, muMax: 0.55, anomalyMin: 180 },
  { id: 'BATCH-20260410-001', day: -3, tempSv: 37, phSv: 7.0, doSv: 35, durationH: 9, outcome: 'success',   feedStart: 2, muMax: 0.48, anomalyMin: -1 },
  { id: 'BATCH-20260411-001', day: -2, tempSv: 34, phSv: 7.0, doSv: 30, durationH: 14, outcome: 'success',  feedStart: 3, muMax: 0.30, anomalyMin: -1 },
  { id: 'BATCH-20260411-002', day: -2, tempSv: 37, phSv: 7.0, doSv: 20, durationH: 7, outcome: 'stopped',   feedStart: 2, muMax: 0.52, anomalyMin: 250 },
  { id: 'BATCH-20260412-001', day: -1, tempSv: 37, phSv: 6.9, doSv: 30, durationH: 8, outcome: 'success',   feedStart: 2, muMax: 0.47, anomalyMin: -1 },
  { id: 'BATCH-20260412-002', day: -1, tempSv: 37, phSv: 7.0, doSv: 30, durationH: 9, outcome: 'partial',   feedStart: 2.5, muMax: 0.42, anomalyMin: 400 },
];

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  BIOCore 多批次数据生成器 (9 批次)');
  console.log('═══════════════════════════════════════════');

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // 获取实际 operator_id
  const userRow = db.prepare('SELECT user_id FROM users LIMIT 1').get() as any;
  const operatorId = userRow?.user_id || 'admin';
  console.log(`  操作员: ${operatorId}`);

  const influxClient = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN });
  const writeApi = influxClient.getWriteApi(INFLUX_ORG, INFLUX_BUCKET, 's');

  const insertSample = db.prepare(`INSERT INTO offline_samples
    (batch_id, sample_time, elapsed_h, od600, glucose_g_L, acetate_g_L, product_titer, product_unit, biomass_g_L, cell_viability_pct, sampled_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'g/L', ?, ?, ?)`);

  const insertSuggestion = db.prepare(`INSERT INTO ai_suggestions
    (batch_id, suggestion_type, source_module, target_param, current_value, suggested_value, confidence, reasoning, status, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  for (const batch of BATCHES) {
    const baseTime = new Date();
    baseTime.setDate(baseTime.getDate() + batch.day);
    baseTime.setHours(2, 0, 0, 0);
    const durationMin = batch.durationH * 60;
    const endTime = new Date(baseTime.getTime() + durationMin * 60 * 1000);

    // 清理旧数据
    const existing = db.prepare('SELECT 1 FROM batches WHERE batch_id = ?').get(batch.id);
    if (existing) {
      db.prepare('DELETE FROM offline_samples WHERE batch_id = ?').run(batch.id);
      db.prepare('DELETE FROM ai_suggestions WHERE batch_id = ?').run(batch.id);
      db.prepare('DELETE FROM batches WHERE batch_id = ?').run(batch.id);
    }

    // 创建批次
    db.prepare(`INSERT INTO batches (batch_id, recipe_id, recipe_version, reactor_id, organism, operator_id,
      started_at, ended_at, current_state, current_phase_index, total_phases, outcome)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'complete', 3, 4, ?)`).run(
      batch.id, RECIPE_ID, RECIPE_VERSION, REACTOR_ID, 'E. coli BL21', operatorId,
      baseTime.toISOString(), endTime.toISOString(), batch.outcome,
    );

    // 生成过程数据
    let cumFeed = 0, cumBase = 0, cumAcid = 0, cumO2 = 0, liquidVolume = 5.0;
    let pvCount = 0, calcCount = 0;

    for (let i = 0; i < durationMin; i++) {
      const ts = new Date(baseTime.getTime() + i * 60 * 1000);
      const tH = i / 60;

      // Phase
      const prepEnd = 30, heatEnd = 60, fermEnd = durationMin - 60;
      let phase_index: number, step_number: number;
      if (i < prepEnd) { phase_index = 0; step_number = Math.floor(i / 10); }
      else if (i < heatEnd) { phase_index = 1; step_number = Math.floor((i - prepEnd) / 15); }
      else if (i < fermEnd) { phase_index = 2; step_number = Math.floor((i - heatEnd) / 90); }
      else { phase_index = 3; step_number = Math.floor((i - fermEnd) / 30); }

      // 温度
      let temperature: number, jacket_temp: number, temp_mode: number, steam_cv: number, cool_cv: number;
      if (i < prepEnd) {
        temperature = 25 + noise(0.3); jacket_temp = 25 + noise(0.5);
        temp_mode = 0; steam_cv = 0; cool_cv = 0;
      } else if (i < heatEnd) {
        const p = (i - prepEnd) / (heatEnd - prepEnd);
        temperature = 25 + (batch.tempSv - 25) * p + noise(0.2);
        jacket_temp = temperature + 5 + noise(0.3);
        temp_mode = 1; steam_cv = clamp(60 * (1 - p) + noise(3), 0, 100); cool_cv = 0;
      } else if (i < fermEnd) {
        const heat = logistic(tH - 1, 0.5, 1.5, batch.durationH * 0.5) * noise(0.1);
        temperature = batch.tempSv + noise(0.15) + heat;
        jacket_temp = temperature - 2 - logistic(tH - 1, 3, 1, batch.durationH * 0.5) + noise(0.2);
        temp_mode = 2; steam_cv = 0;
        cool_cv = clamp(20 + logistic(tH - 1, 40, 1.2, batch.durationH * 0.5) + noise(2), 0, 100);
      } else {
        const p = (i - fermEnd) / 60;
        temperature = batch.tempSv - (batch.tempSv - 4) * p + noise(0.3);
        jacket_temp = temperature - 8 + noise(0.5);
        temp_mode = 2; steam_cv = 0; cool_cv = clamp(90 + noise(3), 0, 100);
      }

      // pH
      let pH: number, P01_rate: number, P04_rate: number;
      if (i < heatEnd) {
        pH = batch.phSv + noise(0.02); P01_rate = 0; P04_rate = 0;
      } else {
        const drift = logistic(tH - 1, -0.8, 1.0, batch.durationH * 0.5);
        pH = batch.phSv + drift * 0.3 + noise(0.05);
        P01_rate = pH < batch.phSv ? clamp((batch.phSv - pH) * 50 + noise(1), 0, 20) : 0;
        P04_rate = pH > batch.phSv + 0.3 ? clamp((pH - batch.phSv - 0.3) * 30, 0, 10) : 0;
        cumBase += P01_rate / 60; cumAcid += P04_rate / 60;
      }

      // DO
      let DO: number, rpm: number, airflow: number;
      if (i < heatEnd) {
        DO = 95 + noise(2); rpm = 200; airflow = 2 + noise(0.1);
      } else {
        const demand = logistic(tH - 1, 1.0, 1.5, batch.durationH * 0.5);
        DO = clamp(95 - demand * (95 - batch.doSv * 0.5) + noise(3), 5, 100);
        rpm = clamp(200 + demand * 300 + noise(5), 200, 800);
        airflow = clamp(2 + demand * 4 + noise(0.2), 1, 10);
      }

      // 异常注入
      if (batch.anomalyMin > 0 && i >= batch.anomalyMin && i <= batch.anomalyMin + 15) {
        DO = clamp(DO - 20 + noise(3), 2, 100);
        temperature += 1.2 + noise(0.3);
      }

      // 补料
      const feedStartMin = batch.feedStart * 60 + heatEnd;
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

      const pressure = clamp(0.5 + (airflow - 2) * 0.05 + noise(0.02), 0, 2);
      const weight = liquidVolume * 1.02 + 2.5 + noise(0.05);
      const vfd_current = clamp(rpm * 0.008 + noise(0.1), 0, 10);
      const air_cv = clamp(airflow / 10 * 100 + noise(2), 0, 100);

      // 写入 InfluxDB process_data
      const pvPoint = new Point('process_data')
        .tag('batch_id', batch.id).tag('reactor_id', REACTOR_ID)
        .floatField('temperature', +temperature.toFixed(2))
        .floatField('jacket_temp', +jacket_temp.toFixed(2))
        .floatField('pH', +pH.toFixed(3))
        .floatField('DO', +DO.toFixed(1))
        .floatField('pressure', +pressure.toFixed(3))
        .floatField('airflow', +airflow.toFixed(2))
        .floatField('weight', +weight.toFixed(2))
        .intField('rpm', Math.round(rpm))
        .floatField('vfd_current', +vfd_current.toFixed(2))
        .floatField('steam_valve', +clamp(steam_cv, 0, 100).toFixed(1))
        .floatField('cool_valve', +clamp(cool_cv, 0, 100).toFixed(1))
        .floatField('air_valve', +air_cv.toFixed(1))
        .floatField('feed_rate_P01', +P01_rate.toFixed(2))
        .floatField('feed_rate_P02', +P02_rate.toFixed(2))
        .floatField('feed_rate_P03', +P03_rate.toFixed(2))
        .floatField('feed_rate_P04', +P04_rate.toFixed(2))
        .intField('temp_mode', temp_mode)
        .floatField('temp_sv', batch.tempSv)
        .floatField('pH_sv', batch.phSv)
        .floatField('DO_sv', batch.doSv)
        .intField('phase_index', phase_index)
        .intField('step_number', step_number)
        .timestamp(ts);
      writeApi.writePoint(pvPoint);
      pvCount++;

      // calculated_params (发酵阶段)
      if (i >= heatEnd) {
        const demand = logistic(tH - 1, 1.0, 1.5, batch.durationH * 0.5);
        const OUR = clamp(demand * 25 * (batch.muMax / 0.5) + noise(1.5), 0, 50);
        const kLa = clamp(50 + rpm * 0.1 + airflow * 5 + noise(3), 10, 200);
        const mu = clamp(logistic(tH - 1, batch.muMax, 2.0, batch.durationH * 0.4) *
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
        calcCount++;
      }
    }

    // 离线取样 (每小时一次, 发酵阶段)
    const fermHours = Math.floor((durationMin - 120) / 60);
    for (let h = 1; h <= fermHours; h++) {
      const sampleTs = new Date(baseTime.getTime() + (60 + h * 60) * 60 * 1000);
      const growth = logistic(h, 1, 1.5, fermHours * 0.5);
      const yieldFactor = batch.muMax / 0.5;
      insertSample.run(
        batch.id, sampleTs.toISOString(), h,
        +(0.1 + growth * 35 * yieldFactor + noise(1.5)).toFixed(2),
        +(20 - growth * 18 + noise(0.5)).toFixed(2),
        +(growth * 2.5 * yieldFactor + noise(0.3)).toFixed(2),
        +(growth * 8.5 * yieldFactor + noise(0.5)).toFixed(2),
        +(0.05 + growth * 12 * yieldFactor + noise(0.5)).toFixed(2),
        +(98 - h * 1.2 + noise(1)).toFixed(1),
        operatorId,
      );
    }

    // AI 建议 (有异常的批次多加几条)
    const expiresAt = endTime.toISOString();
    if (batch.anomalyMin > 0) {
      insertSuggestion.run(batch.id, 'param_adjust', 'cusum_anomaly', 'DO_sv',
        batch.doSv, batch.doSv + 5, 0.82, `CUSUM 检测到 DO 偏低, 建议提高至 ${batch.doSv + 5}%`, 'accepted', expiresAt);
      insertSuggestion.run(batch.id, 'param_adjust', 'threshold_check', 'rpm',
        450, 520, 0.75, '搅拌转速提升可增加 kLa, 改善溶氧', 'pending', expiresAt);
    }
    insertSuggestion.run(batch.id, 'feed_adjust', 'feed_advisor', 'feed_rate_P02',
      15, 18, 0.85, '基于软测量预测, 可适当增加补料速率', batch.outcome === 'success' ? 'accepted' : 'rejected', expiresAt);

    // 重置累积量
    cumFeed = 0; cumBase = 0; cumAcid = 0; cumO2 = 0; liquidVolume = 5.0;

    console.log(`  ✓ ${batch.id}  ${batch.durationH}h  ${batch.outcome.padEnd(7)}  PV:${pvCount} CP:${calcCount}`);
    pvCount = 0; calcCount = 0;
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

  console.log('\n═══════════════════════════════════════════');
  console.log('  9 个批次数据生成完成!');
  console.log('═══════════════════════════════════════════');
}

main().catch(e => { console.error('失败:', e); process.exit(1); });
