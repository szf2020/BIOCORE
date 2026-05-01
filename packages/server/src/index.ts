// ============================================================
// BIOCore 主服务器
// 串联: plc-driver + batch-engine + data-service
// 对外: REST API + WebSocket 实时推送
// ============================================================

import express, { Router } from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
// node-snap7 动态加载: Node v24 可能缺少编译后的 native binding
let S7Client: any;
try {
  S7Client = require('node-snap7').S7Client;
} catch {
  console.warn('[WARN] node-snap7 加载失败 (native binding 缺失), 仅支持 MOCK_PLC=true 模式');
  S7Client = class FakeS7Client { ConnectTo() { throw new Error('node-snap7 不可用'); } };
}
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { resolve as pathResolve } from 'path';
import { v0DeprecationMw, API_V0_SUNSET } from './middlewares/deprecation';
import { authMiddleware, setAuthDb, hashApiKey } from './middlewares/auth';
import { traceMw } from './middlewares/trace';
import { v1ResponseWrapper } from './middlewares/response-wrapper';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { lttb } from './lttb';
import { registerRawMaterialsRoutes } from './raw-materials-routes';
import { registerBatchCompareRoutes } from './batch-compare-routes';
import { registerBatchSamplesRoutes } from './batch-samples-routes';
import { registerBatchExportRoutes } from './batch-export-routes';
import { registerCalibrationRoutes } from './calibration-routes';
import { registerPermissionRoutes } from './middlewares/permissions';
import { registerDoeRoutes } from './doe-routes';
import { registerKpiRoutes, computeAndStore as computeKpi } from './kpi-routes';
import { registerSpcRoutes } from './spc-routes';
import { diff as deepDiff } from 'deep-diff';
import {
  installCrashHandlers,
  MemoryWatchdog,
  MetricsCollector,
  writeDiagnosticDump,
} from '@biocore/runtime-guard';
import { AlertRouter, type ChannelDef, type Rule } from '@biocore/notifier';

// ─── Mini .env 加载 (无 dotenv 依赖) ────────────────────────
// 从项目根 .env 读取 KEY=VALUE 行,注入 process.env (已存在的不覆盖)
(function loadEnv() {
  const candidates = [
    pathResolve(process.cwd(), '.env'),
    pathResolve(process.cwd(), '../../.env'),
    pathResolve(__dirname, '../../../.env'),
  ];
  for (const p of candidates) {
    try {
      const text = readFileSync(p, 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq < 0) continue;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim();
        if (!(key in process.env)) process.env[key] = value;
      }
      console.log(`[${new Date().toISOString()}] [INFO] 已加载 .env: ${p}`);
      return;
    } catch { /* try next candidate */ }
  }
})();

// ─────────────────────────────────────────────────────────────────────────────
// Runtime Guard — BIOCore 加固 (Sprint 4 Track A, T22)
// crash handler + memory watchdog + metrics collector. 必须在业务逻辑前装上,
// 才能捕获后续 import (PLC native binding / SQLite / migrator) 的错误。
// 见: docs/superpowers/specs/2026-05-01-nodejs-hardening-design.md
// ─────────────────────────────────────────────────────────────────────────────
const RUNTIME_GUARD_DUMP_DIR = process.env.BIOCORE_DIAGNOSTIC_DUMP_DIR ?? './crashes';
const RUNTIME_GUARD_KEEP_LAST = Number(process.env.BIOCORE_DIAGNOSTIC_KEEP_LAST ?? 50);
const RUNTIME_GUARD_OOM_GRACE = Number(process.env.BIOCORE_OOM_GRACE_SAMPLES ?? 3);
const RUNTIME_GUARD_OOM_THRESHOLD_MB =
  process.env.BIOCORE_OOM_THRESHOLD_MB && process.env.BIOCORE_OOM_THRESHOLD_MB !== 'auto'
    ? Number(process.env.BIOCORE_OOM_THRESHOLD_MB)
    : undefined;  // undefined = MetricsCollector/MemoryWatchdog auto = RAM × 20%

export const metricsCollector = new MetricsCollector({
  serviceVersion: process.env.npm_package_version ?? '0.1.0',
  oomThresholdMb: RUNTIME_GUARD_OOM_THRESHOLD_MB,
});
metricsCollector.start();

// T40: forward-declared AlertRouter ref so the crash/OOM closures below
// (installed BEFORE sqlite is up) can fire notifier events once the router
// is constructed later in boot. Closures capture this `let` so swapping the
// reference at AlertRouter construction time becomes visible to them.
let alertRouterRef: AlertRouter | undefined;

export const memWd = new MemoryWatchdog({
  thresholdMb: RUNTIME_GUARD_OOM_THRESHOLD_MB,
  graceSamples: RUNTIME_GUARD_OOM_GRACE,
  onExceed: async (info) => {
    console.error('[runtime-guard] memory threshold exceeded', info);
    try {
      await writeDiagnosticDump(new Error('OOM threshold'), 'oom_threshold', {
        dir: RUNTIME_GUARD_DUMP_DIR,
        keepLast: RUNTIME_GUARD_KEEP_LAST,
        extra: info,
      });
    } catch (e) {
      console.error('[runtime-guard] dump on OOM failed:', e);
    }
    // T40: emit oom_threshold to AlertRouter (if up) so configured channels alert.
    if (alertRouterRef) {
      try {
        await alertRouterRef.emit('oom_threshold', {
          rss_mb: info.rss_mb,
          threshold_mb: info.threshold_mb,
          samples: info.samples,
        });
      } catch (e) {
        console.error('[notifier] emit oom_threshold failed:', e);
      }
    }
    if (process.env.NODE_ENV === 'production') {
      console.error('[runtime-guard] sending SIGTERM for supervisor restart');
      process.kill(process.pid, 'SIGTERM');
    } else {
      console.error('[runtime-guard] dev mode: 不自动重启 (需 NODE_ENV=production 才触发 SIGTERM)');
    }
  },
});
memWd.start();

installCrashHandlers({
  onCrash: async (err, type) => {
    console.error(`[runtime-guard] ${type}:`, err.message);
    try {
      await writeDiagnosticDump(err, type, {
        dir: RUNTIME_GUARD_DUMP_DIR,
        keepLast: RUNTIME_GUARD_KEEP_LAST,
      });
    } catch (e) {
      console.error('[runtime-guard] dump failed:', e);
    }
    // T40: emit uncaught_exception to AlertRouter (if up). Best-effort —
    // crash dump is the source of truth; notifier is a courtesy ping.
    if (alertRouterRef) {
      try {
        await alertRouterRef.emit('uncaught_exception', {
          message: err.message,
          stack: err.stack,
          code: (err as { code?: string }).code,
        });
      } catch {
        /* swallow — already crashing */
      }
    }
  },
});

console.log(`[runtime-guard] installed (oom_threshold_mb=${metricsCollector.snapshot().memory.oom_threshold_mb})`);
// ─────────────────────────────────────────────────────────────────────────────

// plc-driver 工具函数 (直接导入，不依�� native 模块加载)
import { parseAddr, byteLen, decode, scale, validateAddr } from '../../plc-driver/src/utils';
import { VariableMappingManager } from '../../plc-driver/src/variable-mapping';
import type { PLCConnectionConfig, PLCVariableMapping } from '../../plc-driver/src/types';

// soft-sensor + experiment-optimizer (实际算法包)
import { SoftSensorEngine } from '../../soft-sensor/src/index';
import { FeedAdvisor } from '../../soft-sensor/src/feed-advisor';
import { RootCauseAnalyzer } from '../../soft-sensor/src/root-cause';
import { BayesianOptimizer } from '../../experiment-optimizer/src/bayesian-optimizer';
import { CUSUMDetector } from '../../ai-analytics/src/cusum';
import { registerCusumRoutes, initCusumBaselines, getDefaultBaselines } from './cusum-routes';
import { registerBatchIntelligenceRoutes } from './batch-intelligence-routes';
import { startSuggestionEngine } from './ai-suggestion-engine';
import { registerAiReportRoutes, detectReportIntent } from './ai-report-routes';
import { createAdminHealthRouter } from './routes/admin-health';
import { createAdminMetricsRouter } from './routes/admin-metrics';
import { createAdminCrashesRouter } from './routes/admin-crashes';
import { EventStream, createEventsSseRouter } from './routes/events-sse';
import { createNotificationsRouter } from './routes/notifications';
import { listChannels as listNotifChannels, listRules as listNotifRules } from '@biocore/data-service';

// JWT 认证
import { createHash, randomBytes } from 'crypto';

const PORT = parseInt(process.env.PORT || '3001');
const DATA_DIR = process.env.DATA_DIR || './data';

// ─── SQLite 初始化 ─────────────────────────────────────────

import { SQLiteService } from '../../data-service/src/sqlite-service';
import { mkdirSync } from 'fs';
import { runMigrations } from './migrator';

mkdirSync(DATA_DIR, { recursive: true });
const sqlite = new SQLiteService(`${DATA_DIR}/biocore.db`);

// 运行 schema migrations (向前迁移, 不可回滚)
// IIFE 因为 top-level await 在 CommonJS 中受限
(async () => {
  try {
    await runMigrations(sqlite.getDatabase());
  } catch (e) {
    console.error('[Migrator] 致命错误, 服务无法启动:', (e as Error).message);
    process.exit(1);
  }
})();

// 注入 sqlite 引用到 auth middleware (用于 API Key 验证)
setAuthDb(sqlite.getDatabase());

const varManager = new VariableMappingManager(sqlite.getDatabase());

// ─── InfluxDB 时序数据库 ────────────────────────────────────
import { InfluxDB, Point } from '@influxdata/influxdb-client';

const INFLUX_URL = process.env.INFLUX_URL || 'http://localhost:8086';
const INFLUX_TOKEN = process.env.INFLUX_TOKEN || '';
const INFLUX_ORG = process.env.INFLUX_ORG || 'BIOCore';
const INFLUX_BUCKET = process.env.INFLUX_BUCKET || 'BIOCore_Data';
// P1 修复: 启动时校验 bucket / org 名称只含安全字符, 防止 Flux 注入扩大面
if (!/^[a-zA-Z0-9_-]+$/.test(INFLUX_BUCKET)) {
  throw new Error(`INFLUX_BUCKET 含非法字符: ${INFLUX_BUCKET}`);
}
if (!/^[a-zA-Z0-9_-]+$/.test(INFLUX_ORG)) {
  throw new Error(`INFLUX_ORG 含非法字符: ${INFLUX_ORG}`);
}

const influxClient = INFLUX_TOKEN
  ? new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN })
  : null;
const influxWriteApi = influxClient
  ? influxClient.getWriteApi(INFLUX_ORG, INFLUX_BUCKET, 's')
  : null;
const influxQueryApi = influxClient
  ? influxClient.getQueryApi(INFLUX_ORG)
  : null;

if (influxClient) {
  console.log(`[${new Date().toISOString()}] [INFO] [Influx] 已连接 ${INFLUX_URL} org=${INFLUX_ORG} bucket=${INFLUX_BUCKET}`);
} else {
  console.warn(`[${new Date().toISOString()}] [WARN] [Influx] 未配置 INFLUX_TOKEN, 时序数据写入和查询均禁用`);
}

// AI 建议引擎句柄
let suggestionEngineHandle: { stop: () => void } | null = null;

// reactor 数据采集 timer (key: reactor_id)
const reactorCollectorTimers = new Map<string, ReturnType<typeof setInterval>>();

// MOCK_PLC: 默认 false (生产安全), 开发演示需在 .env 设置 MOCK_PLC=true
// 开启后所有 plcRead 调用返回模拟值, 启动时打印多行警告框
const MOCK_PLC = process.env.MOCK_PLC === 'true';
if (MOCK_PLC) {
  console.warn('');
  console.warn('  ╔══════════════════════════════════════════════════════╗');
  console.warn('  ║  ⚠ MOCK_PLC=true 模式启用 — 所有 PLC 读取返回模拟值  ║');
  console.warn('  ║  生产部署前必须设置 MOCK_PLC=false 或移除该环境变量  ║');
  console.warn('  ╚══════════════════════════════════════════════════════╝');
  console.warn('');
}

// 开发模式 PLC 读取 (统一定义,server 全局共享)
// 模拟量慢漂移 (DEMO 用, 让趋势图更逼真)
// CUSUM 演示: 周期性注入异常, 让 CUSUM 检测并展示效果
const _demoBase: Record<string, number> = {};
const _demoDrift: Record<string, number> = {};
const _demoStartTime = Date.now();
function devPlcRead(tag: string): number {
  // 缓慢随机游走 + 微小噪声
  if (!_demoBase[tag]) {
    const defaults: Record<string, number> = {
      TEMP_PV: 37, JACKET_PV: 36.5, PH_PV: 7.0, DO_PV: 55,
      PRESSURE_PV: 0.35, AIRFLOW_PV: 5.5, WEIGHT_PV: 7.2,
      VFD_ACTUAL_FREQ: 15, VFD_CURRENT: 2.1,
      STEAM_CV: 0, COOL_CV: 35, AIR_CV: 55,
      P01_RATE: 2.5, P02_RATE: 8.0, P03_RATE: 0.8, P04_RATE: 0,
      VFD_FAULT_CODE: 0, ESTOP: 0,
      STEAM_VALVE_CLOSED: 1, COOL_VALVE_CLOSED: 1, LID_LOCKED: 1,
      STEAM_PRESSURE_SW: 1, HEARTBEAT: 0,
      TEMP_SV: 37, PH_SV: 7, DO_SV: 30,
    };
    _demoBase[tag] = defaults[tag] ?? 0;
    _demoDrift[tag] = 0;
  }
  // 随机游走: 每次调用微小漂移
  _demoDrift[tag] += (Math.random() - 0.5) * 0.06;
  _demoDrift[tag] *= 0.95; // 衰减回零
  const noise = (Math.random() - 0.5) * 0.3;
  if (tag === 'HEARTBEAT') return Date.now() % 256;
  if (tag === 'ESTOP' || tag === 'VFD_FAULT_CODE') return 0;
  if (tag.endsWith('_CLOSED') || tag.endsWith('_LOCKED') || tag.endsWith('_SW')) return 1;

  // ── CUSUM 演示异常注入 ──
  // 周期性偏移, 让 CUSUM S⁺/S⁻ 累积并触发报警, 展示统计过程控制能力
  const elapsedSec = (Date.now() - _demoStartTime) / 1000;
  let anomalyBias = 0;

  if (tag === 'TEMP_PV') {
    // 每 5 分钟周期: 前 2 分钟温度上升 0.8°C (CUSUM S⁺ 累积)
    const cycle = elapsedSec % 300; // 5min 周期
    if (cycle >= 60 && cycle < 180) anomalyBias = 0.8;
  } else if (tag === 'PH_PV') {
    // 每 7 分钟周期: 中间 2 分钟 pH 下降 0.15 (CUSUM S⁻ 累积)
    const cycle = elapsedSec % 420; // 7min 周期
    if (cycle >= 120 && cycle < 240) anomalyBias = -0.15;
  } else if (tag === 'DO_PV') {
    // 每 4 分钟周期: 后 1.5 分钟 DO 下降 12% (明显偏移)
    const cycle = elapsedSec % 240; // 4min 周期
    if (cycle >= 150 && cycle < 240) anomalyBias = -12;
  }

  return _demoBase[tag] + _demoDrift[tag] + noise + anomalyBias;
}

// Phase模板步骤定义: 从数据库读取, 关联系统设置中的Phase模板配置
// 数据库用 PascalCase (Prepare/AddWater), 引擎用 snake_case (prepare/water_fill)
const PHASE_TYPE_TO_DB: Record<string, string> = {
  prepare: 'Prepare', water_fill: 'AddWater', manual_add: 'ManualAdd',
  heating: 'Heating', temp_control: 'TempControl', agitation: 'Agitation',
  feeding: 'Feeding', ph_control: 'PHControl', do_control: 'DOControl',
  aeration: 'Aeration', discharge: 'Discharge', fermentation: 'Fermentation',
  sip: 'SIP', cip: 'CIP',
};

function getTemplateStepsFromDB(phaseType: string): any[] | null {
  try {
    // 先用原始类型查, 再用映射后的 PascalCase 查
    const dbType = PHASE_TYPE_TO_DB[phaseType] || phaseType;
    let row: any = sqlite.getDatabase().prepare(
      'SELECT steps FROM phase_templates WHERE type = ? OR type = ?'
    ).get(phaseType, dbType);
    if (!row || !row.steps) return null;
    const steps = typeof row.steps === 'string' ? JSON.parse(row.steps) : row.steps;
    if (!Array.isArray(steps) || steps.length === 0) return null;

    // 转换 DB 格式 → 引擎格式
    // DB: { step_number, name, description, completion: { logic, conditions[] }, next_step }
    // 引擎: { step_number, name, description, actions, completion_condition: { type, ... } }
    return steps.map((s: any) => ({
      step_number: s.step_number,
      name: s.name || '',
      description: s.description || '',
      actions: s.actions || [],
      completion_condition: convertCompletion(s.completion),
    }));
  } catch (e) {
    console.warn('[getTemplateStepsFromDB] 读取模板失败:', (e as Error).message);
    return null; // 数据库异常回退硬编码
  }
}

/**
 * 转换 DB completion 格式 → 引擎 completion_condition 格式
 * DB:     { logic: "single"|"and"|"or", conditions: [{type, channel, value, duration_s}] }
 * 引擎:  { type: ">=" | "duration" | "and", channel?, value?, duration_s?, sub_conditions? }
 */
function convertCompletion(completion: any): any {
  if (!completion) return { type: 'duration', duration_s: 10 }; // 默认10秒
  const { logic, conditions } = completion;
  if (!conditions || !Array.isArray(conditions) || conditions.length === 0) {
    return { type: 'duration', duration_s: 10 };
  }

  // 单条件
  if (logic === 'single' || conditions.length === 1) {
    return convertSingleCondition(conditions[0]);
  }

  // 多条件 and/or
  return {
    type: logic === 'or' ? 'or' : 'and',
    sub_conditions: conditions.map(convertSingleCondition),
  };
}

function convertSingleCondition(c: any): any {
  if (!c) return { type: 'duration', duration_s: 10 };
  // 条件格式已经兼容引擎 (type, channel, value, duration_s, tolerance)
  const result: any = { type: c.type };
  if (c.channel) result.channel = c.channel;
  if (c.value !== undefined) result.value = c.value;
  if (c.duration_s !== undefined) result.duration_s = c.duration_s;
  if (c.tolerance !== undefined) result.tolerance = c.tolerance;
  return result;
}

// IL/RF 配置从数据库读取
function getInterlockConfigsFromDB(): any[] {
  try {
    const rows = sqlite.getDatabase().prepare(
      'SELECT * FROM interlock_configs WHERE is_enabled = 1 ORDER BY sort_order'
    ).all();
    return rows.map((r: any) => ({
      ...r,
      plc_tags: typeof r.plc_tags === 'string' ? JSON.parse(r.plc_tags) : (r.plc_tags || []),
      condition: typeof r.condition === 'string' ? JSON.parse(r.condition) : (r.condition || {}),
    }));
  } catch {
    return []; // 表不存在时回退硬编码
  }
}

// 启动单个反应器的时序采集 (60秒一次写入 InfluxDB)
function startReactorCollector(reactorId: string): void {
  if (!influxWriteApi || reactorCollectorTimers.has(reactorId)) return;
  const tick = () => {
    try {
      const ctrl = reactorManager.getReactor(reactorId);
      // M2.2 bug 修复: 仅在批次真正 running 时标 real batch_id,
      // 否则一律 'idle' (避免把 downloaded recipe_id 误当 batch_id 污染时序数据)
      const batchId = ctrl && ctrl.currentState === 'running' && ctrl.currentBatchId
        ? ctrl.currentBatchId
        : 'idle';
      const point = new Point('process_data')
        .tag('reactor_id', reactorId)
        .tag('batch_id', String(batchId))
        .floatField('temperature', devPlcRead('TEMP_PV'))
        .floatField('jacket_temp', devPlcRead('JACKET_PV'))
        .floatField('pH', devPlcRead('PH_PV'))
        .floatField('DO', devPlcRead('DO_PV'))
        .floatField('pressure', devPlcRead('PRESSURE_PV'))
        .floatField('airflow', devPlcRead('AIRFLOW_PV'))
        .floatField('weight', devPlcRead('WEIGHT_PV'))
        .floatField('rpm', devPlcRead('VFD_ACTUAL_FREQ') * 24)
        .floatField('vfd_current', devPlcRead('VFD_CURRENT'))
        .timestamp(new Date());
      influxWriteApi!.writePoint(point);
      // 异步 flush, 不阻塞下一次采样
      influxWriteApi!.flush().catch((e: any) =>
        console.error(`[${new Date().toISOString()}] [ERROR] [Influx flush] ${e?.message || e}`)
      );

      // ─── 广播实时 PV 到前端 ──────────────────────────
      const pvPayload = {
        timestamp: new Date().toISOString(),
        batch_id: batchId === 'idle' ? null : batchId,
        'AI-0': devPlcRead('TEMP_PV'),      // 罐温
        'AI-1': devPlcRead('JACKET_PV'),     // 夹套温度
        'AI-2': devPlcRead('PH_PV'),         // pH
        'AI-3': devPlcRead('DO_PV'),         // DO
        'AI-4': devPlcRead('PRESSURE_PV'),   // 罐压
        'AI-5': devPlcRead('AIRFLOW_PV'),    // 空气流量
        'AI-6': devPlcRead('WEIGHT_PV'),     // 称重
        rpm: Math.round(devPlcRead('VFD_ACTUAL_FREQ') * 24),
        vfd_current: devPlcRead('VFD_CURRENT'),
        'AO-0_cv': devPlcRead('STEAM_CV'),   // 蒸汽阀
        'AO-1_cv': devPlcRead('COOL_CV'),    // 冷却阀
        'AO-2_cv': devPlcRead('AIR_CV'),     // 空气阀
        P01_rate: devPlcRead('P01_RATE'),     // 碱泵
        P02_rate: devPlcRead('P02_RATE'),     // 补料泵
        P03_rate: devPlcRead('P03_RATE'),     // 氮源泵
        P04_rate: devPlcRead('P04_RATE'),     // 酸泵
        temp_mode: 2,                         // 冷却模式
        temp_sv: devPlcRead('TEMP_SV'),
        pH_sv: devPlcRead('PH_SV'),
        DO_sv: devPlcRead('DO_SV'),
      };
      broadcast('pv_realtime', pvPayload, batchId === 'idle' ? null : batchId, reactorId);

      // ─── CUSUM 实时异常检测 ───────────────────────────
      if (batchId !== 'idle') {
        const detMap = getCusumKey(batchId);
        const pvMap: Record<string, number> = {
          temperature: devPlcRead('TEMP_PV'),
          pH: devPlcRead('PH_PV'),
          DO: devPlcRead('DO_PV'),
          pressure: devPlcRead('PRESSURE_PV'),
          rpm: devPlcRead('VFD_ACTUAL_FREQ') * 24,
        };
        const cusumResults: Array<{
          channel: string; anomaly: boolean; deviation: number;
          alarming: boolean; cumPos: number; cumNeg: number;
        }> = [];

        for (const [ch, detector] of detMap) {
          const val = pvMap[ch];
          if (val === undefined) continue;
          const r = detector.detect(val);
          cusumResults.push({
            channel: ch,
            anomaly: r.anomaly,
            deviation: r.normalized,
            alarming: r.anomaly,
            cumPos: r.cumPos,
            cumNeg: r.cumNeg,
          });

          // 异常时发送告警并写入数据库
          if (r.anomaly) {
            const direction = r.cumPos > r.cumNeg ? '偏高' : '偏低';
            const alarmData = {
              batch_id: batchId,
              alarm_code: `CUSUM_${ch.toUpperCase()}`,
              severity: 'warning',
              source: 'ai:cusum',
              message: `CUSUM检测: ${ch} 持续${direction}, 偏差 ${r.normalized.toFixed(1)}σ`,
              channel: ch,
              pv_at_trigger: val,
            };
            broadcast('alarm', { reactor_id: reactorId, ...alarmData }, batchId, reactorId);
            try { sqlite.createAlarm(alarmData); } catch { /* ignore */ }
          }
        }

        // 广播 CUSUM 状态到前端
        if (cusumResults.length > 0) {
          broadcast('cusum', cusumResults, batchId, reactorId);
        }

        // ─── 软测量实时推断 ─────────────────────────────
        try {
          const activeModels = softSensorEngine.listModels?.() || [];
          if (activeModels.length > 0) {
            const features: Record<string, number> = {
              temperature: pvMap.temperature,
              pH: pvMap.pH,
              DO: pvMap.DO,
              pressure: pvMap.pressure,
              rpm: pvMap.rpm,
            };
            const predictions: Record<string, any> = {};
            for (const model of activeModels) {
              try {
                const result = softSensorEngine.predict(model.id, features);
                predictions[model.target || model.id] = result;
              } catch { /* 单模型推断失败不影响其他 */ }
            }
            if (Object.keys(predictions).length > 0) {
              broadcast('soft_sensor', predictions, batchId, reactorId);
            }
          }
        } catch { /* 软测量模块错误不影响主采集 */ }
      }
    } catch (e: any) {
      console.error(`[${new Date().toISOString()}] [ERROR] [Influx write] ${e?.message || e}`);
    }
  };
  tick(); // 立即写一次,后续每 60 秒
  const timer = setInterval(tick, 60000);
  reactorCollectorTimers.set(reactorId, timer);
  console.log(`[${new Date().toISOString()}] [INFO] [Influx] 反应器 ${reactorId} 时序采集已启动`);
}

function stopReactorCollector(reactorId: string): void {
  const t = reactorCollectorTimers.get(reactorId);
  if (t) {
    clearInterval(t);
    reactorCollectorTimers.delete(reactorId);
  }
}

// ─── 软测量引擎 (全局单例) ─────────────────────────────────
const softSensorEngine = new SoftSensorEngine();
const feedAdvisor = new FeedAdvisor();
const rootCauseAnalyzer = new RootCauseAnalyzer();

// ─── CUSUM 实时检测器 (per-batch per-channel) ──────────────
const cusumDetectors = new Map<string, Map<string, CUSUMDetector>>();

function getCusumKey(batchId: string): Map<string, CUSUMDetector> {
  if (!cusumDetectors.has(batchId)) {
    const channels = new Map<string, CUSUMDetector>();
    for (const ch of ['temperature', 'pH', 'DO', 'pressure', 'rpm']) {
      channels.set(ch, new CUSUMDetector());
    }
    cusumDetectors.set(batchId, channels);
  }
  return cusumDetectors.get(batchId)!;
}

// P1 修复: 批次完成/停止后清理 CUSUM 检测器, 避免内存泄漏
function clearCusumDetectors(batchId: string): void {
  cusumDetectors.delete(batchId);
}

// ─── JWT 简易实现 ──────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'biocore-dev-secret-change-in-production';
const JWT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24小时

function createJWT(payload: Record<string, any>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({
    ...payload,
    iat: Date.now(),
    exp: Date.now() + JWT_EXPIRY_MS,
  })).toString('base64url');
  const signature = createHash('sha256').update(`${header}.${body}.${JWT_SECRET}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyJWT(token: string): Record<string, any> | null {
  try {
    const [header, body, signature] = token.split('.');
    const expected = createHash('sha256').update(`${header}.${body}.${JWT_SECRET}`).digest('base64url');
    if (signature !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt || randomBytes(16).toString('hex');
  const hash = createHash('sha256').update(password + s).digest('hex');
  return { hash, salt: s };
}

// 初始化默认admin用户 (如果不存在或 hash 是占位符)
try {
  const db = sqlite.getDatabase();
  const existing: any = db.prepare('SELECT user_id, password_hash FROM users WHERE username = ?').get('admin');
  // password_hash 必须是 salt:sha256hash 格式 (32+1+64 = 97 字符以上),否则视为无效需重置
  const hashOk = existing?.password_hash && /^[a-f0-9]{32}:[a-f0-9]{64}$/.test(existing.password_hash);
  if (!existing || !hashOk) {
    const { hash, salt } = hashPassword('admin123');
    if (existing) {
      db.prepare('UPDATE users SET password_hash = ?, display_name = ?, role = ?, is_active = 1 WHERE username = ?')
        .run(`${salt}:${hash}`, '系统管理员', 'admin', 'admin');
      console.log(`[${new Date().toISOString()}] [INFO] 默认admin密码已重置为 admin123`);
    } else {
      db.prepare(`INSERT INTO users (user_id, username, display_name, password_hash, role)
        VALUES (?, ?, ?, ?, ?)`).run('admin-001', 'admin', '系统管理员', `${salt}:${hash}`, 'admin');
      console.log(`[${new Date().toISOString()}] [INFO] 已创建默认admin用户 (admin/admin123)`);
    }
  }
} catch (e) { console.error(`[${new Date().toISOString()}] [ERROR] 初始化admin失败:`, e); }

// ─── Express ───────────────────────────────────────────────

const app: ReturnType<typeof express> = express();
// CORS: 开发模式允许所有 origin, 生产通过 ALLOWED_ORIGINS 环境变量限制
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : true; // true = 允许所有 (仅开发)
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  exposedHeaders: ['X-Trace-Id', 'Deprecation', 'Link'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(traceMw); // 所有路径注入 trace_id (含 v0/v1/非 /api 路径)

// JWT 认证中间件: 已提取到 middlewares/auth.ts
// PUBLIC_PATHS 也已迁移到 auth.ts (注意: 路径不再带 /api 前缀, 因为是 Router 内部路径)
const AUTH_ENABLED = process.env.AUTH_ENABLED !== 'false';

// ─── API 路由器 (双挂载支持 /api/v1 + /api 兼容期) ────────────
const apiRouter = Router();
console.log(`[${new Date().toISOString()}] [INFO] [API] V0 兼容期截止日期: ${API_V0_SUNSET}`);

// ─── Swagger / OpenAPI 文档 ──────────────────────────────────
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'BIOCore API',
      version: '1.0.0',
      description: `发酵罐控制平台 REST API.\n\n旧 \`/api/*\` 路径将于 ${API_V0_SUNSET} 停用,请使用 \`/api/v1/*\`.\n\n两种鉴权方式:\n- **JWT** (Authorization: Bearer xxx) — 给前端 UI 用\n- **API Key** (X-API-Key: ak_xxx.xxx) — 给 MES/外部系统用,优先级更高`,
    },
    servers: [
      { url: 'http://localhost:3001/api/v1', description: 'V1 (推荐)' },
      { url: 'http://localhost:3001/api', description: 'V0 (已废弃, 6 个月后停用)' },
    ],
    components: {
      securitySchemes: {
        ApiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
        Bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        UnifiedResponse: {
          type: 'object',
          properties: {
            code: { type: 'integer', example: 0, description: '0 = 成功, 4xx/5xx = 错误' },
            msg: { type: 'string', example: 'ok' },
            data: { description: '业务数据 (各端点不同)' },
            trace_id: { type: 'string', example: 'aa3029adbfdf68c5', description: '跨系统排错关联 ID' },
          },
        },
      },
    },
    security: [{ Bearer: [] }, { ApiKey: [] }],
  },
  apis: [__filename],  // 扫描本文件中的 JSDoc @openapi 注解
});

// /docs 公开 (无需鉴权), 已在 PUBLIC_PATHS 中
apiRouter.get('/docs.json', (_req, res) => res.json(swaggerSpec));
apiRouter.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'BIOCore API Docs',
}));

// M2.6: 原料库 M9 路由 (7 端点: CRUD + MSDS 上传/下载)
registerRawMaterialsRoutes(apiRouter, sqlite, DATA_DIR);
registerBatchCompareRoutes(apiRouter, sqlite);
registerBatchSamplesRoutes(apiRouter, sqlite);
registerBatchExportRoutes(apiRouter, sqlite);
registerCalibrationRoutes(apiRouter, sqlite);
registerPermissionRoutes(apiRouter, sqlite.getDatabase());
registerDoeRoutes(apiRouter, sqlite);
registerKpiRoutes(apiRouter, sqlite);
registerSpcRoutes(apiRouter, sqlite);
registerCusumRoutes(apiRouter, cusumDetectors, sqlite);
registerBatchIntelligenceRoutes(apiRouter, sqlite, influxQueryApi, rootCauseAnalyzer);
registerAiReportRoutes(apiRouter, sqlite, influxQueryApi);

// T36: runtime-guard exposure (admin health endpoints).
// /liveness is in PUBLIC_PATHS (auth.ts) so docker healthcheck can probe it.
// / and /timeseries are admin-gated inside the router.
apiRouter.use('/admin/health', createAdminHealthRouter({
  metricsCollector,
  crashesDir: RUNTIME_GUARD_DUMP_DIR,
}));

// T37: Prometheus exposition. Default: public (Prometheus standard).
// Gate behind admin via BIOCORE_METRICS_REQUIRE_AUTH=true.
apiRouter.use('/admin/metrics', createAdminMetricsRouter({
  metricsCollector,
  requireAuth: process.env.BIOCORE_METRICS_REQUIRE_AUTH === 'true',
}));

// T38: runtime-guard diagnostic dump access. Admin only.
// list+read crash dumps written by writeDiagnosticDump() under RUNTIME_GUARD_DUMP_DIR.
apiRouter.use('/admin/crashes', createAdminCrashesRouter(RUNTIME_GUARD_DUMP_DIR));

// T39: SSE events stream for external IT systems (MES/SOC/log pipelines).
// Singleton — exposed for AlertRouter (T40) to call .publish() on notifier events.
export const eventStream = new EventStream(Number(process.env.BIOCORE_EVENT_BUFFER_SIZE ?? 1000));
apiRouter.use('/events', createEventsSseRouter(
  eventStream,
  Number(process.env.BIOCORE_SSE_MAX_CLIENTS ?? 100),
));

// T40: AlertRouter — global instance fed by runtime-guard hooks (crash + OOM)
// and admin /api/v1/notifications routes; on successful send it republishes to
// eventStream so SSE subscribers also see the event.
//
// Init timing: migrations IIFE above is fire-and-forget. listChannels/listRules
// query the notification_* tables created by migration 022. We wrap in try/catch
// inside helpers (or here) so a fresh DB pre-migration just yields empty maps.
function buildAlertChannels(db: Database.Database): Record<string, ChannelDef> {
  const out: Record<string, ChannelDef> = {};
  try {
    for (const c of listNotifChannels(db)) {
      if (c.enabled) {
        out[c.id] = { type: c.type, config: c.config as { webhook_url: string; secret?: string } };
      }
    }
  } catch (e) {
    // Pre-migration boot — tables may not exist yet. Empty map is correct.
    console.warn('[notifier] listChannels failed (probably pre-migration):', (e as Error).message);
  }
  return out;
}

function buildAlertRules(db: Database.Database): Rule[] {
  try {
    return listNotifRules(db).map(r => ({
      event_type: r.event_type as Rule['event_type'],
      channel_id: r.channel_id,
      enabled: r.enabled,
      min_severity: r.min_severity,
    }));
  } catch {
    return [];
  }
}

const NOTIFIER_THROTTLE_MS = Number(process.env.BIOCORE_NOTIFIER_THROTTLE_MIN ?? 5) * 60_000;
export const alertRouter = new AlertRouter({
  channels: buildAlertChannels(sqlite.getDatabase()),
  rules: buildAlertRules(sqlite.getDatabase()),
  throttleMs: NOTIFIER_THROTTLE_MS,
});

// onSent: forward successful (non-throttled) emits to SSE so external listeners
// see the same notifier traffic as the configured chat channels.
alertRouter.onSent = (type, payload) => {
  eventStream.publish(type, payload);
};

// Wire ref so the runtime-guard closures (installed before sqlite was up) can fire.
alertRouterRef = alertRouter;

console.log(`[notifier] AlertRouter ready (channels=${Object.keys(buildAlertChannels(sqlite.getDatabase())).length})`);

apiRouter.use('/notifications', createNotificationsRouter({
  db: sqlite.getDatabase(),
  alertRouter,
}));

// 双挂载:
//   /api/v1/* — 新路径, 走 v1ResponseWrapper → authMiddleware → apiRouter
//   /api/*    — 旧路径, 加 deprecation header → authMiddleware → apiRouter (无 wrapper, 保持原格式)
// 6 个月后 (API_V0_SUNSET) 移除第二个 app.use 即可下线 v0 兼容
app.use('/api/v1', v1ResponseWrapper, authMiddleware, apiRouter);
app.use('/api', v0DeprecationMw, authMiddleware, apiRouter);

// 角色权限检查辅助函数
const ROLE_LEVELS: Record<string, number> = { viewer: 0, operator: 1, engineer: 2, admin: 3 };
function requireRole(minRole: string) {
  return (req: any, res: any, next: any) => {
    const userLevel = ROLE_LEVELS[req.user?.role] ?? 0;
    const required = ROLE_LEVELS[minRole] ?? 0;
    if (userLevel < required) return res.status(403).json({ error: `需要${minRole}或更高权限` });
    next();
  };
}

const server = http.createServer(app);

// ─── WebSocket ─────────────────────────────────────────────

const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(channel: string, payload: any, batchId?: string | null, reactorId?: string | null): void {
  const msg = JSON.stringify({
    channel,
    timestamp: new Date().toISOString(),
    batch_id: batchId ?? null,
    reactor_id: reactorId ?? null,
    payload,
  });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

// WS 鉴权:
//   - 客户端连接 ws://localhost:3001/ws?token=<JWT>  (前端 UI)
//   - 或 ws://localhost:3001/ws?api_key=<rawKey>     (MES/外部系统)
//   - 或 X-API-Key header 方式 (但 WebSocket 标准不推荐 header)
//   - 鉴权失败 close(1008, 'Unauthorized')
//   - 开发回退: AUTH_ENABLED=false 时跳过验证 (与 HTTP middleware 一致)
wss.on('connection', (ws, req) => {
  const remoteIp = req.socket.remoteAddress;
  let user: any = null;

  if (AUTH_ENABLED) {
    try {
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      const token = url.searchParams.get('token');
      const apiKey = url.searchParams.get('api_key') || (req.headers['x-api-key'] as string | undefined);

      if (apiKey) {
        // 验证 API Key
        const dotIdx = apiKey.indexOf('.');
        if (dotIdx > 0) {
          const keyId = apiKey.slice(0, dotIdx);
          const rawKey = apiKey.slice(dotIdx + 1);
          const row: any = sqlite.getDatabase().prepare(
            'SELECT key_hash, salt, scopes FROM api_keys WHERE key_id = ? AND revoked = 0'
          ).get(keyId);
          if (row && hashApiKey(rawKey, row.salt) === row.key_hash) {
            user = { user_id: `apikey:${keyId}`, role: 'service' };
            sqlite.getDatabase().prepare('UPDATE api_keys SET last_used_at = datetime("now") WHERE key_id = ?').run(keyId);
          }
        }
      } else if (token) {
        const payload = verifyJWT(token);
        if (payload) user = payload;
      }
    } catch { /* parse error → user 仍为 null */ }

    if (!user) {
      console.warn(`[${new Date().toISOString()}] [WARN] [WS] 未授权连接拒绝: ${remoteIp}`);
      ws.close(1008, 'Unauthorized');
      return;
    }
  } else {
    // 开发模式回退
    user = { user_id: 'admin-001', role: 'admin' };
  }

  (ws as any).user = user;
  console.log(`[${new Date().toISOString()}] [INFO] [WS] 客户端连接 user=${user.user_id} from=${remoteIp} (总数: ${wss.clients.size})`);
  ws.on('close', () => console.log(`[${new Date().toISOString()}] [INFO] [WS] 客户端断开 user=${user.user_id} (剩余: ${wss.clients.size})`));
});

// ─── 只读 S7 连接 (安全: 测试操作绝不写入PLC) ─────────────

const AREA_DB = 0x84;
const WORDLEN_BYTE = 0x02;

// 异步互斥锁 (替代 s7Busy 自旋锁, 修复竞态条件)
class AsyncMutex {
  private queue: (() => void)[] = [];
  private locked = false;
  async acquire(): Promise<void> {
    if (!this.locked) { this.locked = true; return; }
    return new Promise(resolve => this.queue.push(resolve));
  }
  release(): void {
    if (this.queue.length > 0) { this.queue.shift()!(); }
    else { this.locked = false; }
  }
}
const s7Mutex = new AsyncMutex();

async function readOnlyS7(conn: PLCConnectionConfig, byteStart: number, length: number, db: number): Promise<Buffer> {
  await s7Mutex.acquire();
  const client = new S7Client();
  try {
    client.SetConnectionType(3);
    await new Promise<void>((res, rej) => {
      client.ConnectTo(conn.ip, conn.rack ?? 0, conn.slot ?? 1, (err: any) =>
        err ? rej(new Error(`S7连接失败: errCode=${err}`)) : res()
      );
    });
    return await new Promise<Buffer>((res, rej) => {
      client.ReadArea(AREA_DB, db, byteStart, length, WORDLEN_BYTE, (err: any, data: Buffer) =>
        err ? rej(new Error(`S7读取失败: errCode=${err}`)) : res(data)
      );
    });
  } finally {
    client.Disconnect();
    s7Mutex.release();
  }
}

// ─── 心跳服务 ──────────────────────────────────────────────

interface HeartbeatState {
  client: typeof S7Client; timer: ReturnType<typeof setInterval>;
  counter: number; running: boolean; db: number; byteAddr: number;
  errors: number; lastOk: number;
}
const heartbeats = new Map<string, HeartbeatState>();

async function startHeartbeat(conn: PLCConnectionConfig): Promise<void> {
  if (heartbeats.has(conn.id) && heartbeats.get(conn.id)!.running) return;
  const addrValid = validateAddr(conn.heartbeat_write_address);
  if (!addrValid.valid) throw new Error(`心跳地址无效: ${addrValid.error}`);
  const parsed = parseAddr(conn.heartbeat_write_address);
  const db = parsed.db ?? conn.s7_db ?? 1;

  const client = new S7Client();
  client.SetConnectionType(3);
  await new Promise<void>((res, rej) => {
    client.ConnectTo(conn.ip, conn.rack ?? 0, conn.slot ?? 1, (err: any) =>
      err ? rej(new Error(`心跳连接失败: errCode=${err}`)) : res()
    );
  });

  const state: HeartbeatState = {
    client, timer: null as any, counter: 0, running: true,
    db, byteAddr: parsed.byte, errors: 0, lastOk: Date.now(),
  };

  state.timer = setInterval(() => {
    if (!state.running) return;
    const buf = Buffer.alloc(2);
    buf.writeUInt16BE(state.counter, 0);
    client.WriteArea(AREA_DB, state.db, state.byteAddr, 2, WORDLEN_BYTE, buf, (err: any) => {
      if (err) { state.errors++; if (state.errors > 10) stopHeartbeat(conn.id); }
      else { state.errors = 0; state.lastOk = Date.now(); }
    });
    state.counter = (state.counter + 1) % 65536;
    broadcast('heartbeat', { pc: state.counter, alive: state.errors === 0 });
  }, 1000);

  heartbeats.set(conn.id, state);
  console.log(`[${new Date().toISOString()}] [INFO] [心跳] 启动: ${conn.name} → DB${db}.${conn.heartbeat_write_address}`);
}

function stopHeartbeat(id: string): void {
  const s = heartbeats.get(id);
  if (!s) return;
  s.running = false;
  clearInterval(s.timer);
  s.client.Disconnect();
  heartbeats.delete(id);
  console.log(`[${new Date().toISOString()}] [INFO] [心跳] 停止: ${id}`);
}

// ═══════════════════════════════════════════════════════════
// REST API
// ═══════════════════════════════════════════════════════════

// ── 认证 API ──

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: 用户登录
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string, example: admin }
 *               password: { type: string, example: admin123 }
 *     responses:
 *       200:
 *         description: 登录成功, 返回 JWT token
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/UnifiedResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         token: { type: string }
 *                         user:
 *                           type: object
 *                           properties:
 *                             user_id: { type: string }
 *                             username: { type: string }
 *                             display_name: { type: string }
 *                             role: { type: string, enum: [admin, engineer, operator, viewer] }
 *       401: { description: 用户名或密码错误 }
 *       400: { description: 缺少必填字段 }
 */
apiRouter.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '缺少用户名或密码' });
  const user: any = sqlite.getDatabase().prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
  if (!user) return res.status(401).json({ error: '用户名或密码错误' });
  const parts = (user.password_hash || '').split(':');
  if (parts.length !== 2) return res.status(401).json({ error: '用户名或密码错误' });
  const [salt, storedHash] = parts;
  const { hash } = hashPassword(password, salt);
  if (hash !== storedHash) return res.status(401).json({ error: '用户名或密码错误' });
  // 更新最后登录时间
  sqlite.getDatabase().prepare('UPDATE users SET last_login_at = datetime(\'now\') WHERE user_id = ?').run(user.user_id);
  const token = createJWT({ user_id: user.user_id, username: user.username, role: user.role, display_name: user.display_name });
  res.json({ token, user: { user_id: user.user_id, username: user.username, display_name: user.display_name, role: user.role } });
});

apiRouter.get('/auth/me', (req: any, res) => {
  res.json(req.user || null);
});

// ── 用户管理 API ──

apiRouter.get('/users', (req: any, res) => {
  const rows = sqlite.getDatabase().prepare('SELECT user_id, username, display_name, role, created_at, last_login_at, is_active FROM users ORDER BY created_at').all();
  res.json(rows);
});

apiRouter.post('/users', (req: any, res) => {
  const { username, display_name, password, role } = req.body;
  if (!username || !password || !display_name) return res.status(400).json({ error: '缺少必填字段' });
  if (!['admin', 'engineer', 'operator', 'viewer'].includes(role)) return res.status(400).json({ error: '无效角色' });
  const existing = sqlite.getDatabase().prepare('SELECT user_id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: '用户名已存在' });
  const userId = `user-${crypto.randomUUID().slice(0, 8)}`;
  const { hash, salt } = hashPassword(password);
  sqlite.getDatabase().prepare(`INSERT INTO users (user_id, username, display_name, password_hash, role) VALUES (?, ?, ?, ?, ?)`)
    .run(userId, username, display_name, `${salt}:${hash}`, role);
  sqlite.writeAuditLog({ user_id: req.user?.user_id || 'system', action: 'user_create', target_type: 'user', target_id: userId, new_value: JSON.stringify({ username, role }), ip_address: req.ip || req.socket?.remoteAddress || null, trace_id: req.trace_id });
  res.json({ user_id: userId, username, display_name, role });
});

apiRouter.put('/users/:id', (req: any, res) => {
  const { display_name, role, is_active, password } = req.body;
  const updates: string[] = [];
  const params: any[] = [];
  if (display_name !== undefined) { updates.push('display_name = ?'); params.push(display_name); }
  if (role !== undefined) { updates.push('role = ?'); params.push(role); }
  if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }
  if (password) {
    const { hash, salt } = hashPassword(password);
    updates.push('password_hash = ?'); params.push(`${salt}:${hash}`);
  }
  if (updates.length === 0) return res.status(400).json({ error: '无更新字段' });
  params.push(req.params.id);
  sqlite.getDatabase().prepare(`UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`).run(...params);
  res.json({ success: true });
});

apiRouter.delete('/users/:id', (req: any, res) => {
  if (req.params.id === 'admin-001') return res.status(400).json({ error: '不能删除默认管理员' });
  sqlite.getDatabase().prepare('DELETE FROM users WHERE user_id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── PLC 连接 CRUD ──

apiRouter.get('/plc/connections', (_req, res) => {
  res.json(varManager.getConnections());
});

apiRouter.post('/plc/connections', (req, res) => {
  const conn = { id: crypto.randomUUID(), ...req.body };
  varManager.upsertConnection(conn);
  res.json(conn);
});

apiRouter.put('/plc/connections/:id', (req, res) => {
  varManager.upsertConnection({ ...req.body, id: req.params.id });
  res.json({ success: true });
});

apiRouter.delete('/plc/connections/:id', (req, res) => {
  stopHeartbeat(req.params.id);
  varManager.deleteConnection(req.params.id);
  res.json({ success: true });
});

// ── PLC 连接测试 (只读) ──

apiRouter.post('/plc/connections/:id/test', async (req, res) => {
  const conns = varManager.getConnections();
  const conn = conns.find((c: any) => c.id === req.params.id);
  if (!conn) return res.json({ success: false, message: '连接不存在' });
  try {
    const parsed = parseAddr(conn.heartbeat_read_address);
    const db = parsed.db ?? conn.s7_db ?? 1;
    const buf = await readOnlyS7(conn as any, parsed.byte, 2, db);
    res.json({ success: true, message: `连接成功! DB${db}.${conn.heartbeat_read_address}=${buf.readUInt16BE(0)}` });
  } catch (e) {
    res.json({ success: false, message: `连接失败: ${(e as Error).message}` });
  }
});

// ── 心跳控制 ──

apiRouter.post('/plc/connections/:id/heartbeat/start', async (req, res) => {
  const conns = varManager.getConnections();
  const conn = conns.find((c: any) => c.id === req.params.id);
  if (!conn) return res.json({ success: false, message: '连接不存在' });
  try {
    await startHeartbeat(conn as any);
    res.json({ success: true, message: '心跳已启动' });
  } catch (e) { res.json({ success: false, message: (e as Error).message }); }
});

apiRouter.post('/plc/connections/:id/heartbeat/stop', (req, res) => {
  stopHeartbeat(req.params.id);
  res.json({ success: true, message: '心跳已停止' });
});

apiRouter.get('/plc/connections/:id/heartbeat/status', (req, res) => {
  const s = heartbeats.get(req.params.id);
  if (!s) return res.json({ running: false, counter: 0, errors: 0 });
  res.json({ running: s.running, counter: s.counter, errors: s.errors, lastOk: new Date(s.lastOk).toISOString() });
});

// ── PLC 变量 CRUD ──

apiRouter.get('/plc/variables', (req, res) => {
  res.json(varManager.getVariables(req.query.connection_id as string | undefined));
});

apiRouter.post('/plc/variables', (req, res) => {
  const v = { id: crypto.randomUUID(), ...req.body };
  const check = validateAddr(v.plc_address, v.data_type);
  if (!check.valid) return res.status(400).json({ error: `地址无效: ${check.error}` });
  varManager.upsertVariable(v);
  res.json(v);
});

apiRouter.put('/plc/variables/:id', (req, res) => {
  varManager.upsertVariable({ ...req.body, id: req.params.id });
  res.json({ success: true });
});

apiRouter.delete('/plc/variables/:id', (req, res) => {
  varManager.deleteVariable(req.params.id);
  res.json({ success: true });
});

apiRouter.put('/plc/variables', (req, res) => {
  const list: any[] = Array.isArray(req.body) ? req.body : [];
  const errors: string[] = [];
  for (const v of list) {
    try { varManager.upsertVariable(v); } catch (e) { errors.push(`${v.tag_name}: ${e}`); }
  }
  res.json({ updated: list.length - errors.length, errors });
});

// ── 变量测试读取 (只读) ──

apiRouter.post('/plc/variables/:id/test', async (req, res) => {
  const v = req.body;
  const check = validateAddr(v.plc_address, v.data_type);
  if (!check.valid) return res.json({ success: false, message: `地址无效: ${check.error}` });

  const conns = varManager.getConnections();
  const conn = conns.find((c: any) => c.id === v.connection_id);
  if (!conn) return res.json({ success: false, message: '未找到PLC连接' });

  try {
    const parsed = parseAddr(v.plc_address);
    const len = byteLen(v.data_type);
    const db = parsed.db ?? (conn as any).s7_db ?? 1;
    const buf = await readOnlyS7(conn as any, parsed.byte, len, db);
    const raw = decode(buf, v.data_type, parsed.bit);
    const eng = v.scaling_enabled ? scale(raw, v) : raw;
    res.json({ success: true, value: Math.round(eng * 100) / 100, raw, message: `${v.tag_name} = ${eng}` });
  } catch (e) { res.json({ success: false, message: (e as Error).message }); }
});

// ── 导入导出 ──

apiRouter.get('/plc/export/json', (_req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename=plc_config.json');
  res.json(varManager.exportToJSON());
});

apiRouter.get('/plc/export/csv', (_req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=plc_variables.csv');
  res.send('\uFEFF' + varManager.exportToCSV());
});

apiRouter.post('/plc/import/json', (req, res) => {
  res.json(varManager.importFromJSON(req.body));
});

// ── Phase 模板 API ──

function safeJSON(str: string | null | undefined, fallback: any = {}): any {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

apiRouter.get('/phase-templates', (_req, res) => {
  const rows = sqlite.getDatabase().prepare('SELECT * FROM phase_templates ORDER BY sort_order, type').all();
  res.json(rows.map((r: any) => ({
    ...r,
    default_params: safeJSON(r.default_params, {}),
    param_schema: safeJSON(r.param_schema, []),
    steps: safeJSON(r.steps, []),
    plc_mappings: safeJSON(r.plc_mappings, {}),
  })));
});

apiRouter.get('/phase-templates/:type', (req, res) => {
  const row: any = sqlite.getDatabase().prepare('SELECT * FROM phase_templates WHERE type = ?').get(req.params.type);
  if (!row) return res.status(404).json({ error: '模板不存在' });
  res.json({
    ...row,
    default_params: safeJSON(row.default_params, {}),
    param_schema: safeJSON(row.param_schema, []),
    steps: safeJSON(row.steps, []),
    plc_mappings: safeJSON(row.plc_mappings, {}),
  });
});

apiRouter.post('/phase-templates', (req, res) => {
  const t = req.body;
  sqlite.getDatabase().prepare(`INSERT OR REPLACE INTO phase_templates
    (type, label, icon, color, description, category, fixed_steps, default_params, param_schema, steps, plc_mappings, sort_order, is_system)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    t.type, t.label, t.icon || null, t.color || null, t.description || '',
    t.category || '自定义', t.fixed_steps ?? 0,
    JSON.stringify(t.default_params || {}),
    JSON.stringify(t.param_schema || []),
    JSON.stringify(t.steps || []),
    JSON.stringify(t.plc_mappings || {}),
    t.sort_order ?? 99, t.is_system ? 1 : 0,
  );
  res.json({ success: true });
});

apiRouter.put('/phase-templates/:type', (req, res) => {
  const t = req.body;
  sqlite.getDatabase().prepare(`UPDATE phase_templates SET
    label=?, icon=?, color=?, description=?, category=?, fixed_steps=?,
    default_params=?, param_schema=?, steps=?, plc_mappings=?, sort_order=?
    WHERE type=?
  `).run(
    t.label, t.icon || null, t.color || null, t.description || '',
    t.category || '自定义', t.fixed_steps ?? 0,
    JSON.stringify(t.default_params || {}),
    JSON.stringify(t.param_schema || []),
    JSON.stringify(t.steps || []),
    JSON.stringify(t.plc_mappings || {}),
    t.sort_order ?? 99, req.params.type,
  );
  res.json({ success: true });
});

apiRouter.delete('/phase-templates/:type', (req, res) => {
  // 调试阶段: 所有模板均可编辑/删除，待调试完成后锁定内置模板
  sqlite.getDatabase().prepare('DELETE FROM phase_templates WHERE type = ?').run(req.params.type);
  res.json({ success: true });
});

// 初始化/重置默认Phase模板
// ?force=true 强制清空重建
apiRouter.post('/phase-templates/init-defaults', (req, res) => {
  const force = req.query.force === 'true';
  if (force) {
    sqlite.getDatabase().prepare('DELETE FROM phase_templates').run();
  } else {
    const count = (sqlite.getDatabase().prepare('SELECT COUNT(*) as c FROM phase_templates').get() as any).c;
    if (count > 0) return res.json({ message: `已有${count}个模板, 加 ?force=true 强制重置` });
  }

  const defaults = [
    { type: 'Prepare',       label: '准备',     category: '系统操作', color: 'gray',    icon: 'Settings2',      description: '阀门归位、传感器自检、称重清零、VFD检查', fixed_steps: 5, sort_order: 1 },
    { type: 'AddWater',      label: '加水',     category: '系统操作', color: 'blue',    icon: 'Droplets',       description: '加入RO水/培养基底液至目标重量', fixed_steps: 4, sort_order: 2 },
    { type: 'ManualAdd',     label: '人工加料', category: '系统操作', color: 'amber',   icon: 'Hand',           description: '等待操作员手动添加培养基组分或菌种', fixed_steps: 4, sort_order: 3 },
    { type: 'Discharge',     label: '出料',     category: '系统操作', color: 'slate',   icon: 'ArrowDownToLine', description: '降温→停搅拌→泄压→排料→关阀', fixed_steps: 5, sort_order: 4 },
    { type: 'Heating',       label: '加热',     category: '温控',     color: 'orange',  icon: 'Thermometer',    description: '升温至目标温度并稳定', fixed_steps: 4, sort_order: 10 },
    { type: 'TempControl',   label: '控温',     category: '温控',     color: 'orange',  icon: 'ThermometerSun', description: '温度维持或切换至新设定值', fixed_steps: 3, sort_order: 11 },
    { type: 'Agitation',     label: '搅拌',     category: '过程控制', color: 'teal',    icon: 'RotateCw',       description: '启动搅拌至目标转速', fixed_steps: 3, sort_order: 20 },
    { type: 'Feeding',       label: '补料',     category: '过程控制', color: 'green',   icon: 'Pipette',        description: '蠕动泵补料(恒速/指数)', fixed_steps: 3, sort_order: 21 },
    { type: 'PHControl',     label: 'pH调节',   category: '过程控制', color: 'purple',  icon: 'FlaskConical',   description: 'pH闭环控制(补酸/补碱)', fixed_steps: 3, sort_order: 22 },
    { type: 'DOControl',     label: 'DO调节',   category: '过程控制', color: 'cyan',    icon: 'Wind',           description: '溶氧控制(4种策略)', fixed_steps: 3, sort_order: 23 },
    { type: 'Aeration',      label: '通气',     category: '过程控制', color: 'sky',     icon: 'CloudRain',      description: '空气流量调节', fixed_steps: 3, sort_order: 24 },
    { type: 'Fermentation',  label: '发酵',     category: '发酵主体', color: 'emerald', icon: 'Dna',            description: '发酵主体阶段(温度+pH+DO+补料综合)', fixed_steps: 3, sort_order: 30 },
    { type: 'SIP',           label: '就地灭菌', category: '清洗灭菌', color: 'red',     icon: 'Flame',          description: 'SIP灭菌: 升温→保温F₀积分→冷却', fixed_steps: 4, sort_order: 40 },
    { type: 'CIP',           label: '就地清洗', category: '清洗灭菌', color: 'indigo',  icon: 'Waves',          description: 'CIP五步清洗: 预冲→碱洗→中冲→酸洗→终冲', fixed_steps: 5, sort_order: 41 },
  ];

  const stmt = sqlite.getDatabase().prepare(`INSERT OR REPLACE INTO phase_templates
    (type, label, category, color, icon, description, fixed_steps, default_params, param_schema, steps, plc_mappings, sort_order, is_system)
    VALUES (?, ?, ?, ?, ?, ?, ?, '{}', '[]', '[]', '{}', ?, 1)
  `);
  for (const d of defaults) {
    stmt.run(d.type, d.label, d.category, d.color, d.icon, d.description, d.fixed_steps, d.sort_order);
  }
  res.json({ success: true, count: defaults.length });
});

// ── 计算参数公式配置 API ──

import { validateExpression, AVAILABLE_VARS } from '../../data-service/src/formula-evaluator';

/** GET /formula-configs — 列出所有公式 */
apiRouter.get('/formula-configs', (_req, res) => {
  try {
    const rows = sqlite.getDatabase().prepare('SELECT * FROM formula_configs ORDER BY id').all();
    res.json(rows.map((r: any) => ({
      ...r,
      coefficients: safeJSON(r.coefficients, {}),
      input_vars: safeJSON(r.input_vars, []),
    })));
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

/** GET /formula-configs/:id — 单个公式 */
apiRouter.get('/formula-configs/:id', (req, res) => {
  try {
    const row: any = sqlite.getDatabase().prepare('SELECT * FROM formula_configs WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: '公式不存在' });
    res.json({ ...row, coefficients: safeJSON(row.coefficients, {}), input_vars: safeJSON(row.input_vars, []) });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

/** PUT /formula-configs/:id — 更新公式系数或表达式 */
apiRouter.put('/formula-configs/:id', (req, res) => {
  try {
    const { coefficients, expression, formula_type, is_enabled } = req.body || {};
    const sets: string[] = [];
    const params: any[] = [];
    if (coefficients !== undefined) { sets.push('coefficients = ?'); params.push(JSON.stringify(coefficients)); }
    if (expression !== undefined) { sets.push('expression = ?'); params.push(expression); }
    if (formula_type !== undefined) { sets.push('formula_type = ?'); params.push(formula_type); }
    if (is_enabled !== undefined) { sets.push('is_enabled = ?'); params.push(is_enabled ? 1 : 0); }
    if (sets.length === 0) return res.status(400).json({ error: '无修改内容' });
    sets.push("updated_at = datetime('now')");
    params.push(req.params.id);
    sqlite.getDatabase().prepare(`UPDATE formula_configs SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

/** POST /formula-configs/:id/reset — 恢复默认 */
apiRouter.post('/formula-configs/:id/reset', (req, res) => {
  try {
    // 重新执行 migration 中的 INSERT OR REPLACE
    const defaults: Record<string, { coefficients: any }> = {
      kLa: { coefficients: { C: 0.026, a: 0.4, b: 0.5, tankArea: 0.02, rpmRef: 200, pvMultiplier: 0.1 } },
      OUR: { coefficients: { DOStar: 100 } },
      mu: { coefficients: { windowSize: 5 } },
      F0: { coefficients: { Tref: 121, z: 10, threshold: 100 } },
      Vs: { coefficients: { tankArea: 0.02 } },
      PV: { coefficients: { rpmRef: 200, multiplier: 0.1 } },
      cumFeed: { coefficients: { pumpChannel: 'P02', intervalSec: 60 } },
      cumBase: { coefficients: { pumpChannel: 'P01', intervalSec: 60 } },
      cumAcid: { coefficients: { pumpChannel: 'P04', intervalSec: 60 } },
      O2total: { coefficients: {} },
      Vliquid: { coefficients: { initialVolume: 5.0, density: 1.0 } },
      CER: { coefficients: { CO2_in: 0.04, estimateFromRQ: true, defaultRQ: 1.0 } },
      RQ: { coefficients: {} },
      OTR: { coefficients: { DOStar: 100, CStar: 0.21 } },
      qp: { coefficients: { productField: 'product_titer', biomassField: 'OD600', OD_to_DCW: 0.3 } },
      Yxs: { coefficients: { biomassField: 'OD600', substrateField: 'glucose_g_L', OD_to_DCW: 0.3 } },
      Yps: { coefficients: { productField: 'product_titer', substrateField: 'glucose_g_L' } },
    };
    const d = defaults[req.params.id];
    if (!d) return res.status(404).json({ error: '无默认值' });
    sqlite.getDatabase().prepare(
      `UPDATE formula_configs SET coefficients = ?, formula_type = 'parametric', expression = NULL, updated_at = datetime('now') WHERE id = ?`
    ).run(JSON.stringify(d.coefficients), req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

/** POST /formula-configs/validate — 验证自定义表达式 */
apiRouter.post('/formula-configs/validate', (req, res) => {
  const { expression } = req.body || {};
  if (!expression) return res.status(400).json({ error: '缺少 expression' });
  const err = validateExpression(expression, AVAILABLE_VARS);
  res.json({ valid: err === null, error: err, available_vars: AVAILABLE_VARS });
});

// ── IL/RF 连锁故障配置 API ──

/** GET /interlock-configs — 列出所有 IL+RF 配置 */
apiRouter.get('/interlock-configs', (_req, res) => {
  try {
    const rows = sqlite.getDatabase().prepare('SELECT * FROM interlock_configs ORDER BY sort_order').all();
    res.json(rows.map((r: any) => ({ ...r, plc_tags: safeJSON(r.plc_tags, []), condition: safeJSON(r.condition, {}) })));
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

/** GET /interlock-configs/:id */
apiRouter.get('/interlock-configs/:id', (req, res) => {
  try {
    const row: any = sqlite.getDatabase().prepare('SELECT * FROM interlock_configs WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: '不存在' });
    res.json({ ...row, plc_tags: safeJSON(row.plc_tags, []), condition: safeJSON(row.condition, {}) });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

/** PUT /interlock-configs/:id — 修改配置 */
apiRouter.put('/interlock-configs/:id', (req, res) => {
  try {
    const b = req.body || {};
    const sets: string[] = [];
    const params: any[] = [];
    if (b.name !== undefined)        { sets.push('name = ?'); params.push(b.name); }
    if (b.description !== undefined) { sets.push('description = ?'); params.push(b.description); }
    if (b.display_name !== undefined){ sets.push('display_name = ?'); params.push(b.display_name); }
    if (b.plc_tags !== undefined)    { sets.push('plc_tags = ?'); params.push(JSON.stringify(b.plc_tags)); }
    if (b.condition !== undefined)   { sets.push('condition = ?'); params.push(JSON.stringify(b.condition)); }
    if (b.duration_sec !== undefined){ sets.push('duration_sec = ?'); params.push(b.duration_sec); }
    if (b.severity !== undefined)    { sets.push('severity = ?'); params.push(b.severity); }
    if (b.hold_action !== undefined) { sets.push('hold_action = ?'); params.push(b.hold_action); }
    if (b.is_enabled !== undefined)  { sets.push('is_enabled = ?'); params.push(b.is_enabled ? 1 : 0); }
    if (sets.length === 0) return res.status(400).json({ error: '无修改内容' });
    sets.push("updated_at = datetime('now')");
    params.push(req.params.id);
    sqlite.getDatabase().prepare(`UPDATE interlock_configs SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

/** POST /interlock-configs — 新增自定义检测项 */
apiRouter.post('/interlock-configs', (req, res) => {
  try {
    const b = req.body || {};
    if (!b.id || !b.category || !b.name) return res.status(400).json({ error: '缺少 id, category, name' });
    sqlite.getDatabase().prepare(`
      INSERT INTO interlock_configs (id, category, name, description, check_type, plc_tags, condition, duration_sec, severity, hold_action, display_name, is_enabled, is_system, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?)
    `).run(
      b.id, b.category, b.name, b.description || '',
      b.check_type || 'tag_compare',
      JSON.stringify(b.plc_tags || []),
      JSON.stringify(b.condition || {}),
      b.duration_sec || 0,
      b.severity || 'warning',
      b.hold_action || null,
      b.display_name || null,
      b.sort_order || 99,
    );
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

/** DELETE /interlock-configs/:id — 删除自定义项 (系统内置不可删) */
apiRouter.delete('/interlock-configs/:id', (req, res) => {
  try {
    const row: any = sqlite.getDatabase().prepare('SELECT is_system FROM interlock_configs WHERE id = ?').get(req.params.id);
    if (row?.is_system) return res.status(400).json({ error: '系统内置检测项不可删除，可禁用' });
    sqlite.getDatabase().prepare('DELETE FROM interlock_configs WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// ── 配方 API ──

// M3.5: DAG 兼容层
import { dagToLinear, isLinearDag, type RecipeDAG } from './recipe-dag';

// 解析SQLite中JSON字符串字段
function parseRecipeRow(row: any) {
  if (!row) return null;
  const vc = typeof row.vessel_config === 'string' ? JSON.parse(row.vessel_config) : row.vessel_config;
  const meta = row.metadata && typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {});

  // M3.5: 根据 dag_schema_version 决定如何解析 phases 列
  // - schema=1 (老线性配方): phases 列存的是 PhaseConfig[]
  // - schema=2 (新 DAG 配方): phases 列存的是 RecipeDAG, 需要还原为 dag 字段, 同时 phases 字段做兼容
  const schemaVer = (row.dag_schema_version ?? 1) as number;
  const rawPhases = typeof row.phases === 'string' ? JSON.parse(row.phases) : row.phases;

  let phases: any[] = [];
  let dag: RecipeDAG | null = null;

  if (schemaVer >= 2 && rawPhases && rawPhases.schema_version === 2) {
    // v2: rawPhases 是 RecipeDAG
    dag = rawPhases as RecipeDAG;
    // 老编辑器兼容: 如果是纯线性 DAG, 自动转回 phases 数组
    if (isLinearDag(dag)) {
      try { phases = dagToLinear(dag); } catch { phases = []; }
    }
  } else {
    // v1: rawPhases 是 PhaseConfig[]
    phases = Array.isArray(rawPhases) ? rawPhases : [];
  }

  return {
    ...row,
    vessel_config: vc,
    vessel: vc, // Recipe 类型兼容: vessel 和 vessel_config 都指向同一个对象
    phases,
    dag,
    dag_schema_version: schemaVer,
    metadata: meta,
    execution_mode: meta?.execution_mode || 'free', // 从 metadata 中提取执行模式
    // M3.5 v2 字段透传
    is_template: row.is_template ?? 0,
    parent_template_id: row.parent_template_id ?? null,
    parent_version: row.parent_version ?? null,
    rejection_reason: row.rejection_reason ?? null,
  };
}

/**
 * @openapi
 * /recipes:
 *   get:
 *     summary: 列出配方
 *     tags: [Recipes]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, approved, archived, superseded] }
 *         description: 按状态过滤 (例如 approved 表示已锁定的可下载配方)
 *     responses:
 *       200:
 *         description: 配方列表 (含 phases JSON)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/UnifiedResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           recipe_id: { type: string }
 *                           version: { type: string, example: "1.0.0" }
 *                           name: { type: string }
 *                           status: { type: string, enum: [draft, approved, archived, superseded] }
 *                           phases: { type: array, items: { type: object } }
 *                           target_organism: { type: string, nullable: true }
 *                           execution_mode: { type: string, enum: [free, sequential] }
 */
// M3.2: 审核队列 — 必须放在 /:id 动态路由之前, 否则会被 /:id 拦截
/**
 * @openapi
 * /recipes/pending-approvals:
 *   get:
 *     summary: 列出待审核的配方 (M3.2)
 *     tags: [Recipes]
 *     responses:
 *       200: { description: pending_approval 配方列表 }
 */
apiRouter.get('/recipes/pending-approvals', (_req, res) => {
  res.json(sqlite.listPendingApprovals());
});

// 统一审核列表 (pending_approval + pending_deprecation)
apiRouter.get('/recipes/pending-review', (_req, res) => {
  res.json(sqlite.listPendingReview());
});

apiRouter.get('/recipes', (req, res) => {
  const status = req.query.status as string | undefined;
  // M3.3: is_template 过滤
  // 默认 (undefined) → 只返回非模板配方
  // 'true' / '1' → 只返回模板
  // 'all' → 全部 (含模板和配方)
  const isTplRaw = (req.query.is_template as string | undefined)?.toLowerCase();
  let isTemplateFilter: boolean | undefined;
  if (isTplRaw === 'true' || isTplRaw === '1') isTemplateFilter = true;
  else if (isTplRaw === 'all') isTemplateFilter = undefined;
  else isTemplateFilter = false;
  const rows = sqlite.listRecipes(status, { isTemplate: isTemplateFilter });
  res.json(rows.map(parseRecipeRow));
});

apiRouter.get('/recipes/:id', (req, res) => {
  const version = req.query.version as string | undefined;
  const recipe = sqlite.getRecipe(req.params.id, version);
  if (!recipe) return res.status(404).json({ error: '配方不存在' });
  res.json(parseRecipeRow(recipe));
});

apiRouter.post('/recipes', (req, res) => {
  try {
    // 将execution_mode存入metadata JSON
    const body = { ...req.body };
    const meta = body.metadata ? (typeof body.metadata === 'string' ? JSON.parse(body.metadata) : body.metadata) : {};
    if (body.execution_mode) {
      meta.execution_mode = body.execution_mode;
      delete body.execution_mode;
    }
    body.metadata = meta;
    // createRecipe不接受metadata参数, 需要手动处理
    sqlite.createRecipe(body);
    // 如果有metadata中的execution_mode, 补写
    if (meta.execution_mode) {
      sqlite.getDatabase().prepare('UPDATE recipes SET metadata = ? WHERE recipe_id = ? AND version = ?')
        .run(JSON.stringify(meta), body.recipe_id, body.version);
    }
    res.json({ success: true });
  } catch (e) {
    console.error(`[${new Date().toISOString()}] [ERROR] Recipe creation failed: ${(e as Error).message}`);
    res.status(400).json({ error: '配方创建失败，请检查输入参数' });
  }
});

// M3.1: 列出某 recipe_id 的所有版本
/**
 * @openapi
 * /recipes/{id}/versions:
 *   get:
 *     summary: 列出指定 recipe_id 的所有版本(M3.1 版本血缘)
 *     tags: [Recipes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 版本列表 (按 created_at DESC)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   recipe_id: { type: string }
 *                   version: { type: string }
 *                   status: { type: string }
 *                   created_at: { type: string, format: date-time }
 *                   created_by: { type: string }
 *                   parent_version: { type: string, nullable: true }
 *                   dag_schema_version: { type: integer }
 */
apiRouter.get('/recipes/:id/versions', (req, res) => {
  const versions = sqlite.listRecipeVersions(req.params.id);
  res.json(versions);
});

// M3.1: 比较两个版本的差异
/**
 * @openapi
 * /recipes/{id}/diff:
 *   get:
 *     summary: 比较同一 recipe_id 的两个版本(M3.1 deep-diff)
 *     tags: [Recipes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: v1
 *         required: true
 *         schema: { type: string, example: "1.0.0" }
 *       - in: query
 *         name: v2
 *         required: true
 *         schema: { type: string, example: "1.1.0" }
 *     responses:
 *       200:
 *         description: 字段差异列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 v1: { type: object }
 *                 v2: { type: object }
 *                 diff:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       kind: { type: string, enum: [E, N, D, A], description: "E=Edited, N=New, D=Deleted, A=Array" }
 *                       path: { type: array, items: { type: string } }
 *                       lhs: {}
 *                       rhs: {}
 *       404: { description: 任一版本不存在 }
 */
apiRouter.get('/recipes/:id/diff', (req, res) => {
  const v1 = String(req.query.v1 || '');
  const v2 = String(req.query.v2 || '');
  if (!v1 || !v2) return res.status(400).json({ error: '需要 v1 和 v2 参数' });
  const data = sqlite.getRecipeForDiff(req.params.id, v1, v2);
  if (!data) return res.status(404).json({ error: '配方版本不存在' });

  // 用 deep-diff 比对解析后的 recipe (含 phases / dag 字段)
  const r1 = parseRecipeRow(data.v1);
  const r2 = parseRecipeRow(data.v2);
  // 只比对业务字段, 排除时间戳/审批人等元数据
  const project = (r: any) => ({
    name: r.name,
    target_organism: r.target_organism,
    vessel_config: r.vessel_config,
    phases: r.phases,
    dag: r.dag,
    metadata: r.metadata,
  });
  const result = deepDiff(project(r1), project(r2)) || [];
  res.json({
    v1: { version: r1.version, status: r1.status, created_at: r1.created_at },
    v2: { version: r2.version, status: r2.status, created_at: r2.created_at },
    diff: result,
  });
});

// M3.3: 把指定 recipe@version 另存为模板
/**
 * @openapi
 * /recipes/{id}/save-as-template:
 *   post:
 *     summary: 把指定 recipe@version 复制为模板 (M3.3)
 *     tags: [Recipes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [version]
 *             properties:
 *               version: { type: string, example: "1.0.0" }
 *     responses:
 *       200:
 *         description: 模板创建成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 template_id: { type: string, example: "TPL-ECOLI_V1-1762345..." }
 *                 version: { type: string, example: "1.0.0" }
 */
apiRouter.post('/recipes/:id/save-as-template', (req: any, res) => {
  try {
    const version = req.body?.version;
    if (!version) return res.status(400).json({ error: '缺少 version' });
    const result = sqlite.saveAsTemplate(req.params.id, version, req.user?.user_id || 'admin-001');
    writeRecipeAudit(req, 'recipe_save_as_template', req.params.id, version, undefined, {
      template_id: (result as any)?.template_id,
    });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// M3.3: 从模板创建新配方
/**
 * @openapi
 * /recipes/from-template/{templateId}:
 *   post:
 *     summary: 从模板创建一个新的配方实例 (M3.3)
 *     tags: [Recipes]
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema: { type: string, example: "TPL-ECOLI_V1-..." }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [recipe_id, name]
 *             properties:
 *               recipe_id: { type: string, example: "ECOLI_RUN_42" }
 *               name: { type: string, example: "E.coli #42" }
 *               template_version: { type: string, default: "1.0.0" }
 *     responses:
 *       200: { description: 实例化成功 }
 *       400: { description: 缺少 recipe_id 或 name }
 */
apiRouter.post('/recipes/from-template/:templateId', (req: any, res) => {
  try {
    const { recipe_id, name } = req.body || {};
    const templateVersion = req.body?.template_version || '1.0.0';
    if (!recipe_id || !name) return res.status(400).json({ error: '缺少 recipe_id 或 name' });
    sqlite.instantiateTemplate(
      req.params.templateId,
      templateVersion,
      recipe_id,
      name,
      req.user?.user_id || 'admin-001',
    );
    writeRecipeAudit(req, 'recipe_instantiate_template', recipe_id, '1.0.0', undefined, {
      template_id: req.params.templateId,
      template_version: templateVersion,
      name,
    });
    res.json({ success: true, recipe_id });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// M3.2: 提交审核 (draft → pending_approval)
/**
 * @openapi
 * /recipes/{id}/submit-for-review:
 *   post:
 *     summary: 提交配方进入审核队列 (draft → pending_approval) (M3.2)
 *     tags: [Recipes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [version]
 *             properties:
 *               version: { type: string }
 *     responses:
 *       200: { description: 成功 }
 *       400: { description: 状态不是 draft }
 */
apiRouter.post('/recipes/:id/submit-for-review', (req, res) => {
  const { version } = req.body || {};
  if (!version) return res.status(400).json({ error: '缺少 version' });
  const existing = sqlite.getDatabase().prepare(
    'SELECT status FROM recipes WHERE recipe_id = ? AND version = ?'
  ).get(req.params.id, version) as any;
  if (!existing) return res.status(404).json({ error: '配方版本不存在' });
  if (existing.status !== 'draft') {
    return res.status(400).json({ error: `仅 draft 状态可提交审核, 当前为 ${existing.status}` });
  }
  sqlite.submitForReview(req.params.id, version);
  writeRecipeAudit(req as any, 'recipe_submit_review', req.params.id, version);
  res.json({ success: true });
});

// M3.2: 拒绝 (pending_approval → draft + 记录理由)
/**
 * @openapi
 * /recipes/{id}/reject:
 *   post:
 *     summary: 拒绝审核 (pending_approval → draft, 记录 rejection_reason) (M3.2)
 *     tags: [Recipes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [version, reason]
 *             properties:
 *               version: { type: string }
 *               reason: { type: string, description: "必填, 拒绝原因将写入 rejection_reason 并审计" }
 *     responses:
 *       200: { description: 成功 }
 *       400: { description: 缺少 reason 或状态不是 pending_approval }
 */
apiRouter.post('/recipes/:id/reject', (req, res) => {
  const { version, reason } = req.body || {};
  if (!version) return res.status(400).json({ error: '缺少 version' });
  if (!reason || !reason.trim()) return res.status(400).json({ error: '必须提供拒绝原因' });
  const existing = sqlite.getDatabase().prepare(
    'SELECT status FROM recipes WHERE recipe_id = ? AND version = ?'
  ).get(req.params.id, version) as any;
  if (!existing) return res.status(404).json({ error: '配方版本不存在' });
  if (existing.status !== 'pending_approval') {
    return res.status(400).json({ error: `仅 pending_approval 状态可拒绝, 当前为 ${existing.status}` });
  }
  try {
    sqlite.rejectRecipe(req.params.id, version, reason);
    writeRecipeAudit(req as any, 'recipe_reject', req.params.id, version, reason);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// ── 配方废弃流程 ──

// 提交废弃申请 (draft/approved → pending_deprecation)
apiRouter.post('/recipes/:id/submit-for-deprecation', (req, res) => {
  const { version } = req.body || {};
  if (!version) return res.status(400).json({ error: '缺少 version' });
  const existing = sqlite.getDatabase().prepare(
    'SELECT status FROM recipes WHERE recipe_id = ? AND version = ?'
  ).get(req.params.id, version) as any;
  if (!existing) return res.status(404).json({ error: '配方版本不存在' });
  if (!['draft', 'approved'].includes(existing.status)) {
    return res.status(400).json({ error: `仅 draft/approved 状态可提交废弃, 当前为 ${existing.status}` });
  }
  sqlite.submitForDeprecation(req.params.id, version);
  res.json({ success: true });
});

// 批准废弃 (pending_deprecation → deprecated)
apiRouter.post('/recipes/:id/approve-deprecation', (req, res) => {
  const { version } = req.body || {};
  if (!version) return res.status(400).json({ error: '缺少 version' });
  const existing = sqlite.getDatabase().prepare(
    'SELECT status FROM recipes WHERE recipe_id = ? AND version = ?'
  ).get(req.params.id, version) as any;
  if (!existing) return res.status(404).json({ error: '配方版本不存在' });
  if (existing.status !== 'pending_deprecation') {
    return res.status(400).json({ error: `仅 pending_deprecation 状态可批准废弃, 当前为 ${existing.status}` });
  }
  const userId = (req as any).user?.user_id || 'admin-001';
  sqlite.approveDeprecation(req.params.id, version, userId);
  res.json({ success: true });
});

// 拒绝废弃 (回到 pre_deprecation_status)
apiRouter.post('/recipes/:id/reject-deprecation', (req, res) => {
  const { version, reason } = req.body || {};
  if (!version) return res.status(400).json({ error: '缺少 version' });
  if (!reason || !reason.trim()) return res.status(400).json({ error: '必须提供拒绝原因' });
  const existing = sqlite.getDatabase().prepare(
    'SELECT status FROM recipes WHERE recipe_id = ? AND version = ?'
  ).get(req.params.id, version) as any;
  if (!existing) return res.status(404).json({ error: '配方版本不存在' });
  if (existing.status !== 'pending_deprecation') {
    return res.status(400).json({ error: `仅 pending_deprecation 状态可拒绝废弃, 当前为 ${existing.status}` });
  }
  try {
    sqlite.rejectDeprecation(req.params.id, version, reason);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// 从废弃恢复到草稿
apiRouter.post('/recipes/:id/restore', (req, res) => {
  const { version } = req.body || {};
  if (!version) return res.status(400).json({ error: '缺少 version' });
  const existing = sqlite.getDatabase().prepare(
    'SELECT status FROM recipes WHERE recipe_id = ? AND version = ?'
  ).get(req.params.id, version) as any;
  if (!existing) return res.status(404).json({ error: '配方版本不存在' });
  if (existing.status !== 'deprecated') {
    return res.status(400).json({ error: `仅 deprecated 状态可恢复, 当前为 ${existing.status}` });
  }
  sqlite.restoreDeprecated(req.params.id, version);
  res.json({ success: true });
});

// M3.8: 条件表达式校验 (前端 BranchNode 实时调用)
/**
 * @openapi
 * /recipes/validate-expression:
 *   post:
 *     summary: 校验 DAG branch 节点的条件表达式 (M3.8)
 *     tags: [Recipes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [expression]
 *             properties:
 *               expression: { type: string, example: "OD600 > 5 && temperature >= 37" }
 *     responses:
 *       200:
 *         description: 校验结果
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid: { type: boolean }
 *                 error: { type: string, nullable: true }
 *                 usedFields:
 *                   type: array
 *                   items: { type: string }
 *                 ast: { type: object }
 */
apiRouter.post('/recipes/validate-expression', (req, res) => {
  try {
    const { parseExpression } = require('../../batch-engine/src/condition-evaluator');
    const expression = String(req.body?.expression || '');
    const result = parseExpression(expression);
    if (result.ok) {
      res.json({ valid: true, ast: result.ast, usedFields: result.usedFields });
    } else {
      res.json({ valid: false, error: result.error });
    }
  } catch (e) {
    res.status(500).json({ valid: false, error: (e as Error).message });
  }
});

// 审批/锁定配方 (M3.2 加严: 仅 pending_approval 可以)
/**
 * @openapi
 * /recipes/{id}/approve:
 *   post:
 *     summary: 批准配方 (pending_approval → approved) (M3.2 增强)
 *     tags: [Recipes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [version]
 *             properties:
 *               version: { type: string }
 *               approved_by: { type: string, description: "M3.2 加入的审批人记录" }
 *     responses:
 *       200: { description: 批准成功 }
 */
apiRouter.post('/recipes/:id/approve', (req, res) => {
  sqlite.approveRecipe(req.params.id, req.body.version, req.body.approved_by || 'admin-001');
  writeRecipeAudit(req as any, 'recipe_approve', req.params.id, req.body.version, undefined, {
    approved_by: req.body.approved_by || 'admin-001',
  });
  res.json({ success: true });
});

// 锁定/解锁配方 (draft↔approved↔archived)
apiRouter.post('/recipes/:id/status', (req, res) => {
  const { version, status } = req.body;
  if (!['draft', 'approved', 'archived', 'superseded', 'deprecated', 'pending_deprecation'].includes(status)) {
    return res.status(400).json({ error: '无效状态' });
  }
  sqlite.getDatabase().prepare(
    'UPDATE recipes SET status = ? WHERE recipe_id = ? AND version = ?'
  ).run(status, req.params.id, version);
  res.json({ success: true });
});

// 删除配方（先检查关联批次和 DoE 研究）
apiRouter.delete('/recipes/:id', (req, res) => {
  const version = req.query.version as string | undefined;
  const db = sqlite.getDatabase();
  const recipeId = req.params.id;

  // 检查关联批次
  const batchCount = version
    ? (db.prepare('SELECT COUNT(*) as cnt FROM batches WHERE recipe_id = ? AND recipe_version = ?').get(recipeId, version) as any)?.cnt ?? 0
    : (db.prepare('SELECT COUNT(*) as cnt FROM batches WHERE recipe_id = ?').get(recipeId) as any)?.cnt ?? 0;
  if (batchCount > 0) {
    return res.status(409).json({
      error: `无法删除：该配方已关联 ${batchCount} 个批次记录，请先删除相关批次`,
      code: 'FK_BATCHES',
      batchCount,
    });
  }

  // 检查关联 DoE 研究
  try {
    const doeCount = version
      ? (db.prepare('SELECT COUNT(*) as cnt FROM doe_studies WHERE base_recipe_id = ? AND base_recipe_version = ?').get(recipeId, version) as any)?.cnt ?? 0
      : (db.prepare('SELECT COUNT(*) as cnt FROM doe_studies WHERE base_recipe_id = ?').get(recipeId) as any)?.cnt ?? 0;
    if (doeCount > 0) {
      return res.status(409).json({
        error: `无法删除：该配方被 ${doeCount} 个 DoE 研究引用，请先删除相关研究`,
        code: 'FK_DOE',
        doeCount,
      });
    }
  } catch { /* doe_studies 表可能不存在，忽略 */ }

  try {
    if (version) {
      db.prepare('DELETE FROM recipes WHERE recipe_id = ? AND version = ?').run(recipeId, version);
    } else {
      db.prepare('DELETE FROM recipes WHERE recipe_id = ?').run(recipeId);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(409).json({
      error: `删除失败：${err.message ?? '存在关联数据'}`,
      code: 'FK_UNKNOWN',
    });
  }
});

// ─────────────────────────────────────────────────────────────
// ── DoE 双向对接 API (参照 DASware design) ──
// ─────────────────────────────────────────────────────────────

import {
  generateDesignMatrix,
  type DoEFactor,
  type DesignType,
} from '../../experiment-optimizer/src/doe-designs';
import {
  fitResponseModel,
  findOptimum,
  paretoChart,
  type ModelType,
  type ObservationPoint,
} from '../../experiment-optimizer/src/doe-analysis';
// 正交/均匀设计 + 分析模块
import { generateOrthogonalDesign } from '../../experiment-optimizer/src/doe-orthogonal';
import { generateUniformDesign } from '../../experiment-optimizer/src/doe-uniform';
import { rangeAnalysis, type ExperimentResult } from '../../experiment-optimizer/src/doe-range-analysis';
import { orthogonalAnova } from '../../experiment-optimizer/src/doe-anova';
import { multipleRegression, quadraticSurfaceRegression } from '../../experiment-optimizer/src/doe-regression';
import type { RegressionPoint } from '../../experiment-optimizer/src/doe-regression';
import type { DOEFactor as OrthDOEFactor } from '../../experiment-optimizer/src/doe-types';
import { evaluateDesign } from '../../experiment-optimizer/src/doe-diagnostics';

// 工具: 按 path (如 "HEAT_01.target_temp_C") 注入到配方 phase.params
function injectFactorIntoPhases(phases: any[], path: string | undefined, value: number): any[] {
  if (!path || !path.includes('.')) return phases; // path 未定义或格式无效, 跳过注入
  const [phaseIdPart, ...rest] = path.split('.');
  const paramPath = rest.join('.');
  return phases.map(p => {
    if (p.phase_id !== phaseIdPart && p.type !== phaseIdPart) return p;
    const params = structuredClone(p.params || {});
    // 支持嵌套: a.b.c
    const segs = paramPath.split('.');
    let cur = params;
    for (let i = 0; i < segs.length - 1; i++) {
      if (!(segs[i] in cur)) cur[segs[i]] = {};
      cur = cur[segs[i]];
    }
    cur[segs[segs.length - 1]] = value;
    return { ...p, params };
  });
}

// ─── DO 策略 DOE 模板 (4 种策略 × 各 4 因素) ────────────

const DOE_DO_STRATEGY_TEMPLATES: Record<string, {
  name: string; description: string; design_type: string;
  factors: { name: string; path: string; min: number; max: number; levels?: number[] }[];
  responses: { name: string; source: string; goal: string }[];
}> = {
  active_O2: {
    name: 'DO 策略一: 主动调氧优化',
    description: '优化级联 PID 的 DO 设定值、搅拌上限、通气上限和温度。适合 E.coli/酵母高密度好氧发酵。',
    design_type: 'orthogonal',
    factors: [
      { name: 'DO_sv', path: 'Fermentation.controls.DO.sv', min: 20, max: 40, levels: [20, 30, 40] },
      { name: 'RPM_max', path: 'Fermentation.cascade_level1.range_rpm.1', min: 800, max: 1200, levels: [800, 1000, 1200] },
      { name: 'Air_max', path: 'Fermentation.cascade_level2.range_NL_min.1', min: 15, max: 30, levels: [15, 20, 30] },
      { name: 'Temp', path: 'Fermentation.controls.temperature.sv', min: 34, max: 40, levels: [34, 37, 40] },
    ],
    responses: [
      { name: 'titer', source: 'offline_samples.product_titer', goal: 'max' },
      { name: 'OUR_max', source: 'calculated_params.OUR', goal: 'max' },
      { name: 'acetate', source: 'offline_samples.acetate_g_L', goal: 'min' },
      { name: 'kLa', source: 'calculated_params.kLa', goal: 'max' },
    ],
  },
  active_feed: {
    name: 'DO 策略二: DO-stat 补料优化',
    description: 'DO 闭环控制补料速率，搅拌/通气固定。优化 DO 设定、固定搅拌、固定通气和补料上限。天然防溢流。',
    design_type: 'orthogonal',
    factors: [
      { name: 'DO_sv', path: 'Fermentation.controls.DO.sv', min: 20, max: 40, levels: [20, 30, 40] },
      { name: 'RPM_fixed', path: 'Fermentation.agitation_fixed_rpm', min: 500, max: 900, levels: [500, 700, 900] },
      { name: 'Air_fixed', path: 'Fermentation.airflow_fixed_NL_min', min: 5, max: 20, levels: [5, 10, 20] },
      { name: 'Feed_max', path: 'Fermentation.feed_max_mL_h', min: 10, max: 30, levels: [10, 20, 30] },
    ],
    responses: [
      { name: 'titer', source: 'offline_samples.product_titer', goal: 'max' },
      { name: 'acetate_max', source: 'offline_samples.acetate_g_L', goal: 'min' },
      { name: 'V_feed', source: 'calculated_params.V_feed', goal: 'max' },
      { name: 'mu_max', source: 'calculated_params.mu', goal: 'max' },
    ],
  },
  constant_O2: {
    name: 'DO 策略三: 恒定氧气供给优化',
    description: '搅拌/通气固定，DO 自然浮动。适合 kLa 标定、微需氧发酵、菌株耗氧特性表征。',
    design_type: 'orthogonal',
    factors: [
      { name: 'RPM_fixed', path: 'Fermentation.agitation_fixed_rpm', min: 300, max: 900, levels: [300, 600, 900] },
      { name: 'Air_fixed', path: 'Fermentation.airflow_fixed_NL_min', min: 5, max: 20, levels: [5, 10, 20] },
      { name: 'Feed_rate', path: 'Feeding.rate_mL_h', min: 5, max: 20, levels: [5, 10, 20] },
      { name: 'Temp', path: 'Fermentation.controls.temperature.sv', min: 30, max: 42, levels: [30, 37, 42] },
    ],
    responses: [
      { name: 'DO_min', source: 'process_data.DO', goal: 'max' },
      { name: 'titer', source: 'offline_samples.product_titer', goal: 'max' },
      { name: 'kLa', source: 'calculated_params.kLa', goal: 'max' },
      { name: 'OD600_max', source: 'offline_samples.OD600', goal: 'max' },
    ],
  },
  constant_feed: {
    name: 'DO 策略四: 恒定补料速度优化',
    description: '全开环模式，补料按预设曲线执行。适合 DOE 实验、工艺对标、批次一致性验证。可重复性优先。',
    design_type: 'orthogonal',
    factors: [
      { name: 'mu_set', path: 'Feeding.mu_set', min: 0.10, max: 0.20, levels: [0.10, 0.15, 0.20] },
      { name: 'F0', path: 'Feeding.F0_mL_h', min: 1.0, max: 4.0, levels: [1.0, 2.0, 4.0] },
      { name: 'RPM_fixed', path: 'Fermentation.agitation_fixed_rpm', min: 400, max: 800, levels: [400, 600, 800] },
      { name: 'Feed_conc', path: 'Feeding.concentration_g_L', min: 200, max: 600, levels: [200, 400, 600] },
    ],
    responses: [
      { name: 'titer', source: 'offline_samples.product_titer', goal: 'max' },
      { name: 'yield', source: 'batch_kpis.yield_g', goal: 'max' },
      { name: 'acetate', source: 'offline_samples.acetate_g_L', goal: 'min' },
      { name: 'cycle_time', source: 'batch_kpis.cycle_time_h', goal: 'min' },
    ],
  },
};

/** GET /doe/templates/do-strategies — 列出 4 种 DO 策略 DOE 模板 */
apiRouter.get('/doe/templates/do-strategies', (_req, res) => {
  const list = Object.entries(DOE_DO_STRATEGY_TEMPLATES).map(([key, t]) => ({
    key,
    name: t.name,
    description: t.description,
    design_type: t.design_type,
    factor_count: t.factors.length,
    response_count: t.responses.length,
    estimated_runs: 9, // L9(3^4)
  }));
  res.json(list);
});

/**
 * POST /doe/templates/do-strategies/:key/create — 从模板一键创建 DOE 研究
 * Body 可选: { base_recipe_id, base_recipe_version }
 */
apiRouter.post('/doe/templates/do-strategies/:key/create', (req: any, res) => {
  try {
    const key = req.params.key;
    const tmpl = DOE_DO_STRATEGY_TEMPLATES[key];
    if (!tmpl) return res.status(404).json({ error: `未知策略模板: ${key}` });

    const body = req.body || {};
    const study_id = `DOE-DO-${key.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    sqlite.createDoeStudy({
      study_id,
      name: tmpl.name,
      description: tmpl.description,
      base_recipe_id: body.base_recipe_id || null,
      base_recipe_version: body.base_recipe_version || null,
      design_type: tmpl.design_type,
      factors: tmpl.factors,
      responses: tmpl.responses,
      created_by: req.user?.user_id || 'admin-001',
    });

    // 自动生成设计矩阵
    const orthFactors = tmpl.factors.map(f => ({
      name: f.name,
      levels: f.levels || [f.min, (f.min + f.max) / 2, f.max],
    }));
    const design = generateOrthogonalDesign(orthFactors);
    sqlite.replaceDoeRuns(study_id, design.runs.map(r => ({
      run_index: r.runIndex,
      factor_values: r.factorValues,
    })));

    const factorNames = tmpl.factors.map(f => f.name);
    const diagnostics = evaluateDesign(factorNames, design.runs.map(r => ({ factor_values: r.factorValues })));

    sqlite.updateDoeStudyStatus(study_id, 'designed');

    res.json({
      success: true,
      study_id,
      name: tmpl.name,
      run_count: design.runs.length,
      diagnostics,
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// GET /doe/studies — 列表
apiRouter.get('/doe/studies', (_req, res) => {
  res.json(sqlite.listDoeStudies());
});

// POST /doe/studies — 创建
apiRouter.post('/doe/studies', (req: any, res) => {
  try {
    const body = req.body || {};
    if (!body.name || !body.design_type) {
      return res.status(400).json({ error: '缺少 name 或 design_type' });
    }
    const study_id = body.study_id || `DOE-${Date.now().toString(36).toUpperCase()}`;
    sqlite.createDoeStudy({
      study_id,
      name: body.name,
      description: body.description,
      base_recipe_id: body.base_recipe_id,
      base_recipe_version: body.base_recipe_version,
      design_type: body.design_type,
      factors: body.factors || [],
      responses: body.responses || [],
      created_by: req.user?.user_id || 'admin-001',
    });
    res.json({ success: true, study_id });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// GET /doe/studies/:id — 详情
apiRouter.get('/doe/studies/:id', (req, res) => {
  const study = sqlite.getDoeStudy(req.params.id);
  if (!study) return res.status(404).json({ error: '研究不存在' });
  const runs = sqlite.listDoeRuns(req.params.id);
  res.json({ ...study, runs });
});

// PATCH /doe/studies/:id — 更新基本信息
apiRouter.patch('/doe/studies/:id', (req, res) => {
  try {
    sqlite.updateDoeStudy(req.params.id, req.body || {});
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// DELETE /doe/studies/:id
apiRouter.delete('/doe/studies/:id', (req, res) => {
  sqlite.deleteDoeStudy(req.params.id);
  res.json({ success: true });
});

// POST /doe/studies/:id/generate-design — 根据 factors + design_type 生成设计矩阵, 写入 doe_runs
apiRouter.post('/doe/studies/:id/generate-design', (req, res) => {
  try {
    const study = sqlite.getDoeStudy(req.params.id);
    if (!study) return res.status(404).json({ error: '研究不存在' });
    const factors: DoEFactor[] = study.factors;
    if (factors.length === 0) return res.status(400).json({ error: '未定义因子' });

    const opts = req.body || {};
    let runs: { run_index: number; factor_values: Record<string, number> }[] = [];

    if (study.design_type === 'orthogonal') {
      // 正交设计: 需要因素定义 levels 数组
      const orthFactors: OrthDOEFactor[] = factors.map(f => ({
        name: f.name,
        levels: f.levels
          ? (Array.isArray(f.levels) ? f.levels : [f.min, (f.min + f.max) / 2, f.max])
          : [f.min, (f.min + f.max) / 2, f.max],
      }));
      const design = generateOrthogonalDesign(orthFactors, opts.arrayName);
      runs = design.runs.map(r => ({ run_index: r.runIndex, factor_values: r.factorValues }));
    } else if (study.design_type === 'uniform') {
      // 均匀设计: 连续因素映射
      const uniformFactors = factors.map(f => ({ name: f.name, min: f.min, max: f.max }));
      const design = generateUniformDesign(uniformFactors, opts.tableName);
      runs = design.runs.map(r => ({ run_index: r.runIndex, factor_values: r.factorValues }));
    } else {
      // full_factorial / ccd / latin_hypercube / plackett_burman / box_behnken
      const matrix = generateDesignMatrix(
        study.design_type as DesignType,
        factors,
        { n: opts.n, centerReps: opts.centerReps, alpha: opts.alpha },
      );
      runs = matrix.map(r => ({ run_index: r.run_index, factor_values: r.factor_values }));
    }

    sqlite.replaceDoeRuns(req.params.id, runs);

    // 设计诊断
    const factorNames = factors.map(f => f.name);
    const diagnostics = evaluateDesign(factorNames, runs);

    res.json({ success: true, run_count: runs.length, runs, diagnostics });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// POST /doe/studies/:id/materialize — 把每个 run 转成一个子配方 (从 base_recipe 克隆 + 注入因子值)
apiRouter.post('/doe/studies/:id/materialize', (req: any, res) => {
  try {
    const study = sqlite.getDoeStudy(req.params.id);
    if (!study) return res.status(404).json({ error: '研究不存在' });
    if (!study.base_recipe_id || !study.base_recipe_version) {
      return res.status(400).json({ error: '未关联基础配方 (base_recipe)' });
    }
    const baseRow = sqlite.getRecipe(study.base_recipe_id, study.base_recipe_version);
    if (!baseRow) return res.status(400).json({ error: '基础配方不存在' });
    const baseRecipe = parseRecipeRow(baseRow);
    const runs = sqlite.listDoeRuns(req.params.id);
    if (runs.length === 0) return res.status(400).json({ error: '未生成设计矩阵, 请先调用 /generate-design' });

    const factors: DoEFactor[] = study.factors;
    // 校验因素 path 必填
    const missingPath = factors.filter((f: any) => !f.path || !f.path.includes('.'));
    if (missingPath.length > 0) {
      return res.status(400).json({ error: `因素 ${missingPath.map((f: any) => f.name).join(', ')} 缺少配方参数路径(path), 请在设计页填写 (格式: phase_id.param_key)` });
    }
    const createdBy = req.user?.user_id || 'admin-001';
    const results: any[] = [];

    for (const run of runs) {
      // 注入因子值到 phases 拷贝
      let phases = structuredClone(baseRecipe.phases || []);
      for (const f of factors) {
        const v = (run.factor_values as any)[f.name];
        if (v === undefined) continue;
        phases = injectFactorIntoPhases(phases, f.path, v);
      }
      const childId = `${baseRecipe.recipe_id}_DOE_${req.params.id}_${run.run_index}`;
      const childVersion = '1.0.0';
      try {
        sqlite.createRecipe({
          recipe_id: childId,
          version: childVersion,
          name: `${baseRecipe.name} [DoE ${req.params.id} #${run.run_index}]`,
          author: baseRecipe.author,
          target_organism: baseRecipe.target_organism,
          vessel_config: baseRecipe.vessel_config,
          phases,
          dag_schema_version: 1,
          is_template: 0,
          parent_template_id: undefined,
          parent_version: baseRecipe.version,
          created_by: createdBy,
        });
        sqlite.updateDoeRunRecipe(req.params.id, run.run_index, childId, childVersion);
        results.push({ run_index: run.run_index, recipe_id: childId, status: 'ok' });
      } catch (e) {
        results.push({ run_index: run.run_index, status: 'error', error: (e as Error).message });
      }
    }
    sqlite.updateDoeStudyStatus(req.params.id, 'running');
    res.json({ success: true, results });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// POST /doe/studies/:id/runs/:runIdx/bind-batch — 绑定批次 (手动, 批次启动后由前端调用)
apiRouter.post('/doe/studies/:id/runs/:runIdx/bind-batch', (req, res) => {
  try {
    const { batch_id } = req.body || {};
    if (!batch_id) return res.status(400).json({ error: '缺少 batch_id' });
    sqlite.bindDoeRunBatch(req.params.id, parseInt(req.params.runIdx, 10), batch_id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// POST /doe/studies/:id/runs/:runIdx/response — 回填响应变量 (手动或自动)
apiRouter.post('/doe/studies/:id/runs/:runIdx/response', (req, res) => {
  try {
    const { responses, notes } = req.body || {};
    if (!responses || typeof responses !== 'object') {
      return res.status(400).json({ error: '缺少 responses 对象' });
    }
    sqlite.setDoeRunResponse(req.params.id, parseInt(req.params.runIdx, 10), responses, notes);
    // 若全部完成, 自动把 study 标记为 completed
    const runs = sqlite.listDoeRuns(req.params.id);
    if (runs.length > 0 && runs.every(r => r.status === 'completed')) {
      sqlite.updateDoeStudyStatus(req.params.id, 'completed');
    }
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// GET /doe/studies/:id/model — 拟合响应面模型 + ANOVA + Pareto + 最优点
apiRouter.get('/doe/studies/:id/model', (req, res) => {
  try {
    const study = sqlite.getDoeStudy(req.params.id);
    if (!study) return res.status(404).json({ error: '研究不存在' });
    const runs = sqlite.listDoeRuns(req.params.id);
    const factors: DoEFactor[] = study.factors;
    const responses = study.responses as { name: string; goal: 'max' | 'min' }[];
    if (factors.length === 0 || responses.length === 0) {
      return res.status(400).json({ error: '研究因子或响应未定义' });
    }

    const completedRuns = runs.filter(r => r.status === 'completed' && r.response_values);

    // 按 design_type 选择分析方法
    if (study.design_type === 'orthogonal') {
      // ── 正交设计: 极差分析 + ANOVA ──
      const orthFactors: OrthDOEFactor[] = factors.map(f => ({
        name: f.name,
        levels: f.levels
          ? (Array.isArray(f.levels) ? f.levels : [f.min, (f.min + f.max) / 2, f.max])
          : [f.min, (f.min + f.max) / 2, f.max],
      }));

      // 构造正交设计对象 (重建)
      const design = generateOrthogonalDesign(orthFactors);
      const perResponse: any[] = [];

      for (const resp of responses) {
        const results: ExperimentResult[] = completedRuns
          .filter(r => r.response_values![resp.name] != null)
          .map(r => ({ runIndex: r.run_index, response: r.response_values![resp.name] as number }));

        if (results.length === 0) { perResponse.push({ response: resp.name, error: '无已完成的观测值' }); continue; }

        const goal = resp.goal === 'min' ? 'minimize' : 'maximize';
        const range = rangeAnalysis(design, results, orthFactors, goal as any);
        const anova = orthogonalAnova(design, results, orthFactors);
        perResponse.push({
          response: resp.name, goal: resp.goal || 'max',
          analysis_type: 'orthogonal',
          rangeAnalysis: range,
          anova,
        });
      }
      return res.json({ study_id: req.params.id, design_type: 'orthogonal', responses: perResponse });

    } else if (study.design_type === 'uniform') {
      // ── 均匀设计: 多元回归 ──
      const perResponse: any[] = [];
      for (const resp of responses) {
        const points: RegressionPoint[] = completedRuns
          .filter(r => r.response_values![resp.name] != null)
          .map(r => ({ x: r.factor_values, y: r.response_values![resp.name] as number }));
        if (points.length === 0) { perResponse.push({ response: resp.name, error: '无已完成的观测值' }); continue; }

        const xNames = factors.map(f => f.name);
        // 先尝试二阶响应曲面, 数据不足降级为多元线性
        let regression = quadraticSurfaceRegression(points, xNames);
        let regType = 'quadratic';
        if (!regression) { regression = multipleRegression(points, xNames); regType = 'linear'; }
        if (!regression) { perResponse.push({ response: resp.name, error: '回归失败 (数据不足)' }); continue; }

        perResponse.push({
          response: resp.name, goal: resp.goal || 'max',
          analysis_type: 'regression', regression_type: regType,
          regression,
        });
      }
      return res.json({ study_id: req.params.id, design_type: 'uniform', responses: perResponse });

    } else {
      // ── 其他设计: RSM (fitResponseModel) ──
      const modelType = (req.query.model as ModelType) || 'quadratic';
      const perResponse: any[] = [];
      for (const resp of responses) {
        const points: ObservationPoint[] = completedRuns
          .filter(r => r.response_values![resp.name] != null)
          .map(r => ({ factor_values: r.factor_values, response: r.response_values![resp.name] as number }));
        if (points.length === 0) { perResponse.push({ response: resp.name, error: '无已完成的观测值' }); continue; }

        const model = fitResponseModel(points, factors, modelType);
        if (!model) { perResponse.push({ response: resp.name, error: '模型拟合失败 (可能样本不足)' }); continue; }

        const pareto = paretoChart(model);
        const optimum = findOptimum(model, factors, resp.goal || 'max');
        perResponse.push({ response: resp.name, goal: resp.goal || 'max', analysis_type: 'rsm', model, pareto, optimum });
      }
      return res.json({ study_id: req.params.id, design_type: study.design_type, model_type: modelType, responses: perResponse });
    }
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// GET /doe/studies/:id/contour — 等高线图数据 (RSM 网格预测)
apiRouter.get('/doe/studies/:id/contour', (req, res) => {
  try {
    const study = sqlite.getDoeStudy(req.params.id);
    if (!study) return res.status(404).json({ error: '研究不存在' });
    const runs = sqlite.listDoeRuns(req.params.id);
    const factors: DoEFactor[] = study.factors;
    const responseName = req.query.response as string;
    const factorX = req.query.factorX as string;
    const factorY = req.query.factorY as string;
    const gridSize = parseInt(req.query.grid as string || '20', 10);

    if (!responseName || !factorX || !factorY) return res.status(400).json({ error: '缺少 response, factorX, factorY' });

    // 拟合模型
    const completedRuns = runs.filter(r => r.status === 'completed' && r.response_values);
    const points: ObservationPoint[] = completedRuns
      .filter(r => r.response_values![responseName] != null)
      .map(r => ({ factor_values: r.factor_values, response: r.response_values![responseName] as number }));
    if (points.length < 3) return res.status(400).json({ error: '数据不足' });

    const model = fitResponseModel(points, factors, 'quadratic');
    if (!model) return res.status(400).json({ error: '模型拟合失败' });

    // 网格预测
    const fX = factors.find(f => f.name === factorX);
    const fY = factors.find(f => f.name === factorY);
    if (!fX || !fY) return res.status(400).json({ error: '因素不存在' });

    const xVals: number[] = [], yVals: number[] = [];
    for (let i = 0; i < gridSize; i++) {
      xVals.push(fX.min + (fX.max - fX.min) * i / (gridSize - 1));
      yVals.push(fY.min + (fY.max - fY.min) * i / (gridSize - 1));
    }

    // 其余因素固定在中心
    const fixedVals: Record<string, number> = {};
    for (const f of factors) {
      if (f.name !== factorX && f.name !== factorY) fixedVals[f.name] = (f.min + f.max) / 2;
    }

    const allBeta = [model.intercept, ...model.terms.map(t => t.coefficient)];
    const z: number[][] = [];
    for (const yv of yVals) {
      const row: number[] = [];
      for (const xv of xVals) {
        const fv: Record<string, number> = { ...fixedVals, [factorX]: xv, [factorY]: yv };
        // 编码 → [-1,1]
        const coded = factors.map(f => {
          const mid = (f.min + f.max) / 2, half = (f.max - f.min) / 2;
          return half === 0 ? 0 : (fv[f.name] - mid) / half;
        });
        // 扩展特征
        const features = [1, ...coded];
        for (let i = 0; i < coded.length; i++) for (let j = i + 1; j < coded.length; j++) features.push(coded[i] * coded[j]);
        for (let i = 0; i < coded.length; i++) features.push(coded[i] * coded[i]);
        let pred = 0;
        for (let i = 0; i < features.length && i < allBeta.length; i++) pred += features[i] * allBeta[i];
        row.push(Math.round(pred * 1000) / 1000);
      }
      z.push(row);
    }

    res.json({ factorX, factorY, response: responseName, x: xVals, y: yVals, z });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// ── DOE 自动响应收集 (断点1修复) ──

/** 从 batch 数据自动提取 DOE 响应值 */
function autoCollectDoeResponses(db: any, studyId: string, runIndex: number): Record<string, number> | null {
  const study = sqlite.getDoeStudy(studyId);
  if (!study) return null;
  const runs = sqlite.listDoeRuns(studyId);
  const run = runs.find(r => r.run_index === runIndex);
  if (!run || !run.batch_id) return null;

  const batchId = run.batch_id;
  const responses: Record<string, number> = {};

  for (const resp of (study.responses as { name: string; source?: string; goal: string }[])) {
    const source = resp.source || '';
    const [table, field] = source.split('.');
    if (!table || !field) continue;

    try {
      if (table === 'offline_samples') {
        const row: any = db.prepare(
          `SELECT ${field} as val FROM offline_samples WHERE batch_id = ? AND ${field} IS NOT NULL ORDER BY sample_time DESC LIMIT 1`
        ).get(batchId);
        if (row?.val != null) responses[resp.name] = row.val;
      } else if (table === 'batch_kpis') {
        const row: any = db.prepare(
          `SELECT ${field} as val FROM batch_kpis WHERE batch_id = ?`
        ).get(batchId);
        if (row?.val != null) responses[resp.name] = row.val;
      }
      // InfluxDB 源 (calculated_params / process_data) 暂不支持自动收集
    } catch { /* 字段不存在等，跳过 */ }
  }

  return Object.keys(responses).length > 0 ? responses : null;
}

/** POST /doe/studies/:id/runs/:runIdx/auto-collect — 自动从 batch 数据收集响应 */
apiRouter.post('/doe/studies/:id/runs/:runIdx/auto-collect', (req, res) => {
  try {
    const db = sqlite.getDatabase();
    const responses = autoCollectDoeResponses(db, req.params.id, parseInt(req.params.runIdx, 10));
    if (!responses) return res.status(400).json({ error: '无法自动收集: 批次未绑定或无数据' });

    sqlite.setDoeRunResponse(req.params.id, parseInt(req.params.runIdx, 10), responses);
    // 检查是否全部完成
    const runs = sqlite.listDoeRuns(req.params.id);
    if (runs.length > 0 && runs.every(r => r.status === 'completed')) {
      sqlite.updateDoeStudyStatus(req.params.id, 'completed');
    }
    res.json({ success: true, collected: responses });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

/** POST /doe/studies/:id/auto-collect-all — 批量自动收集所有已绑定批次的响应 */
apiRouter.post('/doe/studies/:id/auto-collect-all', (req, res) => {
  try {
    const db = sqlite.getDatabase();
    const runs = sqlite.listDoeRuns(req.params.id);
    const results: any[] = [];

    for (const run of runs) {
      if (run.status === 'completed') { results.push({ run_index: run.run_index, status: 'already_completed' }); continue; }
      if (!run.batch_id) { results.push({ run_index: run.run_index, status: 'no_batch' }); continue; }

      const responses = autoCollectDoeResponses(db, req.params.id, run.run_index);
      if (responses && Object.keys(responses).length > 0) {
        sqlite.setDoeRunResponse(req.params.id, run.run_index, responses);
        results.push({ run_index: run.run_index, status: 'collected', responses });
      } else {
        results.push({ run_index: run.run_index, status: 'no_data' });
      }
    }

    // 检查是否全部完成
    const updatedRuns = sqlite.listDoeRuns(req.params.id);
    if (updatedRuns.length > 0 && updatedRuns.every(r => r.status === 'completed')) {
      sqlite.updateDoeStudyStatus(req.params.id, 'completed');
    }

    const collected = results.filter(r => r.status === 'collected').length;
    res.json({ success: true, total: runs.length, collected, results });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// ── DOE 最优配方生成 (断点3修复) ──

/** POST /doe/studies/:id/create-optimal-recipe — 服务端生成最优配方 + 回链 */
apiRouter.post('/doe/studies/:id/create-optimal-recipe', (req: any, res) => {
  try {
    const study = sqlite.getDoeStudy(req.params.id);
    if (!study) return res.status(404).json({ error: '研究不存在' });
    if (!study.base_recipe_id || !study.base_recipe_version) {
      return res.status(400).json({ error: '未关联基础配方' });
    }

    const { response_name, optimum_factor_values, predicted_response } = req.body || {};
    if (!response_name || !optimum_factor_values) {
      return res.status(400).json({ error: '缺少 response_name 或 optimum_factor_values' });
    }

    // 验证因素值在范围内
    const factors: DoEFactor[] = study.factors;
    for (const f of factors) {
      const v = optimum_factor_values[f.name];
      if (v === undefined) continue;
      if (v < f.min || v > f.max) {
        return res.status(400).json({ error: `因素 ${f.name} 值 ${v} 超出范围 [${f.min}, ${f.max}]` });
      }
    }

    // 获取基础配方
    const baseRow = sqlite.getRecipe(study.base_recipe_id, study.base_recipe_version);
    if (!baseRow) return res.status(400).json({ error: '基础配方不存在' });
    const baseRecipe = parseRecipeRow(baseRow);

    // 注入最优因素值
    let phases = structuredClone(baseRecipe.phases || []);
    for (const f of factors) {
      const v = optimum_factor_values[f.name];
      if (v === undefined) continue;
      phases = injectFactorIntoPhases(phases, f.path, v);
    }

    // 创建最优配方
    const recipeId = `${study.base_recipe_id}_DOE_OPT_${req.params.id}_${response_name}`;
    const recipeVersion = '1.0.0';
    const createdBy = req.user?.user_id || 'admin-001';

    try {
      sqlite.createRecipe({
        recipe_id: recipeId,
        version: recipeVersion,
        name: `${baseRecipe.name} [DoE ${req.params.id} 最优-${response_name}]`,
        author: baseRecipe.author,
        target_organism: baseRecipe.target_organism,
        vessel_config: baseRecipe.vessel_config,
        phases,
        dag_schema_version: 1,
        is_template: 0,
        parent_template_id: undefined,
        parent_version: baseRecipe.version,
        created_by: createdBy,
      });
    } catch (e) {
      // 配方已存在则更新
      if ((e as Error).message?.includes('UNIQUE')) {
        return res.status(400).json({ error: '最优配方已存在, 请先删除旧版本' });
      }
      throw e;
    }

    // 回链到 DOE 研究
    const db = sqlite.getDatabase();
    db.prepare(`
      UPDATE doe_studies SET
        optimal_recipe_id = ?, optimal_recipe_version = ?,
        optimal_response = ?, optimal_predicted = ?,
        status = CASE WHEN status != 'archived' THEN 'completed' ELSE status END,
        updated_at = datetime('now')
      WHERE study_id = ?
    `).run(recipeId, recipeVersion, response_name, predicted_response ?? null, req.params.id);

    res.json({
      success: true,
      recipe_id: recipeId,
      recipe_version: recipeVersion,
      optimal_factor_values: optimum_factor_values,
      predicted_response,
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// ── 批次 API ──

/**
 * @openapi
 * /batches:
 *   get:
 *     summary: 列出批次
 *     tags: [Batches]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: 批次列表
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/UnifiedResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           batch_id: { type: string }
 *                           recipe_id: { type: string }
 *                           recipe_version: { type: string }
 *                           reactor_id: { type: string }
 *                           organism: { type: string, nullable: true }
 *                           current_state: { type: string, enum: [idle, running, held, paused, stopped, complete] }
 *                           started_at: { type: string, format: date-time, nullable: true }
 *                           ended_at: { type: string, format: date-time, nullable: true }
 */
apiRouter.get('/batches', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
  // M2.3: 可选 reactor_id 过滤 (正则消毒)
  const reactorIdRaw = String(req.query.reactor_id || '').replace(/[^A-Za-z0-9_-]/g, '');
  const reactorId = reactorIdRaw || undefined;
  res.json(sqlite.listBatches(limit, offset, reactorId));
});

apiRouter.get('/batches/:id', (req, res) => {
  const batch = sqlite.getBatch(req.params.id);
  if (!batch) return res.status(404).json({ error: '批次不存在' });
  res.json(batch);
});

apiRouter.get('/batches/:id/transitions', (req, res) => {
  res.json(sqlite.getStateTransitions(req.params.id));
});

apiRouter.get('/batches/:id/phases', (req, res) => {
  res.json(sqlite.getPhaseLogs(req.params.id));
});

apiRouter.get('/batches/:id/steps', (req, res) => {
  res.json(sqlite.getStepLogs(req.params.id));
});

// ── 报警 API ──

/**
 * @openapi
 * /alarms:
 *   get:
 *     summary: 列出报警
 *     tags: [Alarms]
 *     responses:
 *       200:
 *         description: 报警列表 (含未确认状态)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/UnifiedResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: integer }
 *                           batch_id: { type: string, nullable: true }
 *                           alarm_code: { type: string }
 *                           severity: { type: string, enum: [info, warning, critical, emergency] }
 *                           message: { type: string }
 *                           triggered_at: { type: string, format: date-time }
 *                           acknowledged_at: { type: string, format: date-time, nullable: true }
 */
apiRouter.get('/alarms', (req, res) => {
  res.json(sqlite.getUnacknowledgedAlarms(req.query.batch_id as string | undefined));
});

apiRouter.post('/alarms/:id/acknowledge', (req, res) => {
  sqlite.acknowledgeAlarm(parseInt(req.params.id), req.body.user_id || 'admin-001');
  res.json({ success: true });
});

// ── 审计日志 ──

// M3.10 辅助: 后端 recipe 工作流审计写入
// 前端 useAudit 负责记录操作人+原因(交互产物);后端负责记录 user_id/ip/trace(系统产物),
// 确保 MES 通过 API Key 直连时也有审计留痕。两条记录通过 trace_id 关联。
function writeRecipeAudit(
  req: any,
  action:
    | 'recipe_submit_review'
    | 'recipe_approve'
    | 'recipe_reject'
    | 'recipe_save_as_template'
    | 'recipe_instantiate_template',
  recipeId: string,
  version: string,
  reason?: string,
  extra?: Record<string, unknown>,
) {
  try {
    sqlite.writeAuditLog({
      user_id: req.user?.user_id || 'system',
      action,
      target_type: 'recipe',
      target_id: `${recipeId}@${version}`,
      new_value: JSON.stringify({ version, ...(extra || {}) }),
      reason: reason || undefined,
      ip_address: req.ip || req.socket?.remoteAddress || undefined,
      trace_id: req.trace_id,
    });
  } catch (e) {
    console.warn('[writeRecipeAudit] 审计写入失败:', (e as Error).message);
  }
}

apiRouter.get('/audit-logs', (req, res) => {
  res.json(sqlite.getAuditLogs(req.query.batch_id as string | undefined));
});

apiRouter.post('/audit-logs', (req: any, res) => {
  const { batch_id, user_id, action, target_type, target_id, old_value, new_value, reason } = req.body;
  if (!user_id || !action) return res.status(400).json({ error: '缺少user_id或action' });
  try {
    sqlite.writeAuditLog({
      batch_id: batch_id || undefined,
      user_id,
      action,
      target_type: target_type || 'parameter',
      target_id: target_id || '',
      old_value: old_value ? String(old_value) : undefined,
      new_value: new_value ? String(new_value) : undefined,
      reason: reason || '',
      ip_address: req.ip || req.socket?.remoteAddress || undefined,
      trace_id: req.trace_id,
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── API Key 管理 (供 MES 等外部系统调用 biocore) ──

apiRouter.get('/api-keys', (req: any, res) => {
  try {
    const rows = sqlite.getDatabase().prepare(`
      SELECT key_id, name, scopes, created_by, created_at, last_used_at, revoked
      FROM api_keys
      WHERE created_by = ?
      ORDER BY created_at DESC
    `).all(req.user?.user_id || 'admin-001');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

apiRouter.post('/api-keys', (req: any, res) => {
  const { name, scopes } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: '缺少 name (key 描述)' });
  }
  try {
    // 生成 keyId + rawKey + salt + hash
    const keyId = 'ak_' + randomBytes(8).toString('hex');
    const rawSecret = randomBytes(32).toString('base64url');
    const salt = randomBytes(16).toString('hex');
    const hash = hashApiKey(rawSecret, salt);
    const fullKey = `${keyId}.${rawSecret}`;
    const scopesStr = (scopes && typeof scopes === 'string') ? scopes : 'read:* write:*';

    sqlite.getDatabase().prepare(`
      INSERT INTO api_keys (key_id, key_hash, salt, name, scopes, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(keyId, hash, salt, name.trim(), scopesStr, req.user?.user_id || 'admin-001');

    // 唯一一次返回 raw key, 提示客户端立即保存
    res.json({
      keyId,
      rawKey: fullKey,
      name: name.trim(),
      scopes: scopesStr,
      warning: '此 raw key 只显示一次, 关闭后无法找回, 请立即复制保存',
    });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

apiRouter.delete('/api-keys/:id', (req: any, res) => {
  try {
    const result = sqlite.getDatabase().prepare(
      'UPDATE api_keys SET revoked = 1 WHERE key_id = ? AND created_by = ?'
    ).run(req.params.id, req.user?.user_id || 'admin-001');
    if (result.changes === 0) return res.status(404).json({ error: 'API Key 不存在或无权限' });
    res.json({ success: true, key_id: req.params.id });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

apiRouter.post('/api-keys/:id/rotate', (req: any, res) => {
  try {
    const oldKey: any = sqlite.getDatabase().prepare(
      'SELECT name, scopes FROM api_keys WHERE key_id = ? AND created_by = ? AND revoked = 0'
    ).get(req.params.id, req.user?.user_id || 'admin-001');
    if (!oldKey) return res.status(404).json({ error: 'API Key 不存在或已撤销' });

    // 撤销旧 key
    sqlite.getDatabase().prepare('UPDATE api_keys SET revoked = 1 WHERE key_id = ?').run(req.params.id);

    // 创建新 key (复用旧的 name 和 scopes)
    const keyId = 'ak_' + randomBytes(8).toString('hex');
    const rawSecret = randomBytes(32).toString('base64url');
    const salt = randomBytes(16).toString('hex');
    const hash = hashApiKey(rawSecret, salt);
    const fullKey = `${keyId}.${rawSecret}`;

    sqlite.getDatabase().prepare(`
      INSERT INTO api_keys (key_id, key_hash, salt, name, scopes, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(keyId, hash, salt, oldKey.name, oldKey.scopes, req.user?.user_id || 'admin-001');

    res.json({
      keyId,
      rawKey: fullKey,
      name: oldKey.name,
      scopes: oldKey.scopes,
      rotated_from: req.params.id,
      warning: '此 raw key 只显示一次, 旧 key 已撤销',
    });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

apiRouter.get('/api-keys/:id/usage', (req: any, res) => {
  try {
    const row: any = sqlite.getDatabase().prepare(
      'SELECT key_id, name, last_used_at, created_at, revoked FROM api_keys WHERE key_id = ? AND created_by = ?'
    ).get(req.params.id, req.user?.user_id || 'admin-001');
    if (!row) return res.status(404).json({ error: 'API Key 不存在' });

    // 最近 100 条由该 API Key 触发的审计记录
    const audits = sqlite.getDatabase().prepare(`
      SELECT id, action, target_type, target_id, timestamp
      FROM audit_logs
      WHERE user_id = ?
      ORDER BY timestamp DESC
      LIMIT 100
    `).all(`apikey:${req.params.id}`);

    res.json({ ...row, recent_audits: audits });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// ── 离线取样 ──

/**
 * @openapi
 * /batches/{id}/samples:
 *   get:
 *     summary: 查询批次离线取样记录
 *     tags: [OfflineSamples]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: batch_id
 *     responses:
 *       200: { description: 按 sample_time 升序的样本列表 }
 *   post:
 *     summary: 新增离线取样记录
 *     tags: [OfflineSamples]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sample_time, sampled_by]
 *             properties:
 *               sample_time:      { type: string, format: date-time, example: "2026-04-08T10:30:00Z" }
 *               sampled_by:       { type: string, example: "alice" }
 *               od600:            { type: number, example: 12.4 }
 *               dcw_g_L:          { type: number, example: 8.2, description: "干重 (dry cell weight)" }
 *               glucose_g_L:      { type: number, example: 2.1 }
 *               acetate_g_L:      { type: number, example: 0.5 }
 *               product_titer:    { type: number, example: 32 }
 *               product_unit:     { type: string, example: "mg/L" }
 *               lactate_g_L:      { type: number, example: 0.3, description: "M2.4 新增: 乳酸浓度" }
 *               biomass_g_L:      { type: number, example: 24.1, description: "M2.4 新增: 湿重生物量 (与 dcw_g_L 干重区分)" }
 *               cell_viability_pct: { type: number, example: 93.5, description: "M2.4 新增: 细胞活性百分比 0-100" }
 *               ethanol_g_L:      { type: number, example: 1.2, description: "M2.4 新增: 乙醇浓度" }
 *               notes:            { type: string }
 *     responses:
 *       200: { description: 添加成功 }
 */
apiRouter.get('/batches/:id/samples', (req, res) => {
  res.json(sqlite.getOfflineSamples(req.params.id));
});

apiRouter.post('/batches/:id/samples', (req, res) => {
  sqlite.addOfflineSample({ ...req.body, batch_id: req.params.id });
  res.json({ success: true });
});

// ── 校准 ──

apiRouter.get('/calibrations/:channel', (req, res) => {
  res.json(sqlite.getLatestCalibration(req.params.channel) || null);
});

apiRouter.post('/calibrations', (req, res) => {
  sqlite.addCalibration(req.body);
  res.json({ success: true });
});

// ── AI API ──

// Check Ollama status
apiRouter.get('/ai/status', async (_req, res) => {
  try {
    const resp = await fetch('http://localhost:11434/api/tags');
    if (!resp.ok) throw new Error('Ollama not responding');
    const data: any = await resp.json();
    res.json({ available: true, models: (data.models || []).map((m: any) => m.name) });
  } catch {
    res.json({ available: false, models: [], message: 'Ollama未运行。请执行: ollama serve' });
  }
});

// Chat with LLM
apiRouter.post('/ai/chat', async (req, res) => {
  const { message, history, messages, model } = req.body;
  // 兼容两种格式: { message, history } 或 { messages }
  let chatMessages = messages;
  if (!chatMessages && message) {
    chatMessages = [
      ...(history || []),
      { role: 'user', content: message },
    ];
  }
  if (!chatMessages || chatMessages.length === 0) {
    return res.status(400).json({ error: '缺少消息内容' });
  }
  try {
    const resp = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model || 'gemma4', messages: chatMessages, stream: false }),
      signal: AbortSignal.timeout(120000),
    });
    if (!resp.ok) throw new Error(`Ollama error: ${resp.status}`);
    const data: any = await resp.json();
    const content = data.message?.content || '';
    // 返回多种字段兼容前端
    res.json({ reply: content, response: content, content, message: content });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// NL to Flux query
apiRouter.post('/ai/nl-to-flux', async (req, res) => {
  const { question, batchId } = req.body;
  const systemPrompt = `You are a InfluxDB Flux query generator for BIOCore fermentation system.
Database: bucket "fermentation", measurements: process_data (fields: temperature, pH, DO, pressure, airflow, weight, rpm), calculated_params (fields: OUR, kLa, mu).
Tags: batch_id, reactor_id.
Convert the user's natural language question into a valid Flux query. Return ONLY the Flux query, no explanation.
${batchId ? `Current batch: ${batchId}` : ''}`;

  try {
    const resp = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question },
        ],
        stream: false,
      }),
    });
    if (!resp.ok) throw new Error('Ollama error');
    const data: any = await resp.json();
    const flux = data.message?.content || '';
    res.json({ flux, question });
  } catch (e) {
    res.json({ flux: '', question, error: (e as Error).message });
  }
});

// ── 批次报表导出 ──

// Export batch report as JSON (full data package)
apiRouter.get('/batches/:id/report', (req, res) => {
  const batch = sqlite.getBatch(req.params.id);
  if (!batch) return res.status(404).json({ error: '批次不存在' });

  const transitions = sqlite.getStateTransitions(req.params.id);
  const phases = sqlite.getPhaseLogs(req.params.id);
  const steps = sqlite.getStepLogs(req.params.id);
  const alarms = sqlite.getDatabase().prepare(
    'SELECT * FROM alarms WHERE batch_id = ? ORDER BY triggered_at'
  ).all(req.params.id);
  const samples = sqlite.getOfflineSamples(req.params.id);
  const auditLogs = sqlite.getAuditLogs(req.params.id);

  // Parse JSON fields in batch
  const parsedBatch = {
    ...batch,
    state_snapshot: batch.state_snapshot ? JSON.parse(batch.state_snapshot) : null,
  };

  res.json({
    batch: parsedBatch,
    transitions,
    phases,
    steps,
    alarms,
    samples,
    auditLogs,
    generated_at: new Date().toISOString(),
  });
});

// Export batch as CSV
apiRouter.get('/batches/:id/export/csv', (req, res) => {
  const batch = sqlite.getBatch(req.params.id);
  if (!batch) return res.status(404).json({ error: '批次不存在' });

  const steps = sqlite.getStepLogs(req.params.id);
  const headers = ['phase_id','phase_type','step_number','step_name','started_at','ended_at','elapsed_sec','result'];
  const rows = steps.map((s: any) => headers.map(h => String(s[h] ?? '')).join(','));
  const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=batch_${req.params.id}.csv`);
  res.send(csv);
});

// Generate AI summary for a completed batch
apiRouter.post('/batches/:id/generate-summary', async (req, res) => {
  const batch = sqlite.getBatch(req.params.id);
  if (!batch) return res.status(404).json({ error: '批次不存在' });

  const phases = sqlite.getPhaseLogs(req.params.id);
  const alarms = sqlite.getDatabase().prepare(
    'SELECT * FROM alarms WHERE batch_id = ? ORDER BY triggered_at'
  ).all(req.params.id);

  const prompt = `请为以下发酵批次生成200-500字的中文结构化摘要：
批次号: ${batch.batch_id}
配方: ${batch.recipe_id} v${batch.recipe_version}
菌种: ${batch.organism || '未指定'}
状态: ${batch.current_state}
结果: ${batch.outcome || '进行中'}
Phase数: ${phases.length}
报警数: ${alarms.length}
${batch.notes ? '备注: ' + batch.notes : ''}

请从以下维度总结：1.培养概况 2.关键工艺事件 3.异常与处理 4.结论建议`;

  try {
    const resp = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gemma4', prompt, stream: false }),
    });
    if (!resp.ok) throw new Error('Ollama未运行');
    const data: any = await resp.json();
    const summary = data.response || '';

    // Save summary to batch
    sqlite.updateBatch(req.params.id, { summary_text: summary });

    res.json({ summary });
  } catch (e) {
    res.json({ summary: '', error: (e as Error).message });
  }
});

// ── 软测量 API ──

apiRouter.get('/soft-sensor/models', (_req, res) => {
  res.json(softSensorEngine.listModels());
});

apiRouter.post('/soft-sensor/predict', (req, res) => {
  const { modelId, features } = req.body;
  if (!modelId || !features) return res.status(400).json({ error: '缺少modelId或features' });
  try {
    const result = softSensorEngine.predict(modelId, features);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

apiRouter.post('/soft-sensor/train', (req, res) => {
  const { target, features, featureNames, trainingData, modelId: reqModelId } = req.body;
  const resolvedFeatures: string[] = featureNames || (typeof features === 'string' ? features.split(',').map((f: string) => f.trim()) : features);
  if (!target || !resolvedFeatures || resolvedFeatures.length === 0) {
    return res.status(400).json({ error: '缺少 target 或 features' });
  }
  const id = reqModelId || `model_${target}_${Date.now()}`;
  try {
    // 若未提供训练数据，从已完成批次生成合成训练数据
    let data = trainingData;
    if (!data || data.length < 3) {
      // 生成合成训练数据 (基于典型发酵参数范围)
      const syntheticCount = 50;
      data = [];
      for (let i = 0; i < syntheticCount; i++) {
        const row: Record<string, number> = {};
        // 典型特征范围
        const temp = 30 + Math.random() * 10; // 30-40°C
        const pH = 6.0 + Math.random() * 2.0; // 6-8
        const DO = 10 + Math.random() * 80; // 10-90%
        const rpm = 100 + Math.random() * 400; // 100-500
        if (resolvedFeatures.includes('temperature')) row.temperature = temp;
        if (resolvedFeatures.includes('pH')) row.pH = pH;
        if (resolvedFeatures.includes('DO')) row.DO = DO;
        if (resolvedFeatures.includes('rpm')) row.rpm = rpm;
        // 目标变量 (模拟非线性关系 + 噪声)
        if (target === 'OD600') {
          row[target] = 0.5 + 0.02 * temp + 0.3 * (pH - 7) * (pH - 7) * -1 + 0.005 * DO + 0.001 * rpm + (Math.random() - 0.5) * 0.3;
        } else if (target === 'glucose') {
          row[target] = 20 - 0.3 * temp + 0.1 * DO - 0.005 * rpm + (Math.random() - 0.5) * 2;
        } else {
          row[target] = 5 + 0.1 * temp + 0.05 * DO + (Math.random() - 0.5) * 1;
        }
        data.push(row);
      }
    }

    const model = SoftSensorEngine.trainLinearModel(target, resolvedFeatures, data);
    model.id = id;
    model.name = `${target}_model`;
    softSensorEngine.registerModel(model);
    // 设置特征范围用于外推检测
    const ranges: Record<string, [number, number]> = {};
    for (const f of resolvedFeatures) {
      const vals = data.map((d: any) => d[f] ?? 0);
      ranges[f] = [Math.min(...vals), Math.max(...vals)];
    }
    softSensorEngine.setFeatureRanges(id, ranges);
    res.json({
      success: true,
      id,
      r_squared: model.r_squared,
      coefficients: model.coefficients,
      intercept: model.intercept,
      trainingSamples: data.length,
      features: resolvedFeatures,
      status: model.r_squared >= 0.5 ? 'active' : 'inactive',
      message: model.r_squared >= 0.5 ? '模型训练成功' : '模型R²偏低，建议增加训练数据或调整特征',
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

apiRouter.delete('/soft-sensor/models/:id', (req, res) => {
  softSensorEngine.removeModel(req.params.id);
  res.json({ success: true });
});

// ── 补料建议 API ──

apiRouter.post('/soft-sensor/feed-recommend', (req, res) => {
  try {
    const result = feedAdvisor.recommend(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: `补料建议计算失败: ${err.message}` });
  }
});

// ── 根因分析 API ──

apiRouter.post('/root-cause/analyze', (req, res) => {
  const { alarmCode, alarmTime, paramHistory, paramNames, normalRanges } = req.body;
  if (!alarmCode) return res.status(400).json({ error: '缺少alarmCode' });
  try {
    const result = rootCauseAnalyzer.analyze({
      alarmCode,
      alarmTime: alarmTime ? new Date(alarmTime) : new Date(),
      paramHistory: paramHistory || {},
      paramNames: paramNames || Object.keys(paramHistory || {}),
      normalRanges: normalRanges || {},
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── 补料建议 API ──

apiRouter.post('/feed-advisor/recommend', (req, res) => {
  const p = req.body;
  try {
    const result = feedAdvisor.recommend({
      currentOD: p.currentOD ?? 1,
      currentGlucose: p.currentGlucose ?? 0.5,
      targetMu: p.targetMu ?? 0.15,
      muMax: p.muMax ?? 0.5,
      Ks: p.Ks ?? 0.05,
      Yxs: p.Yxs ?? 0.45,
      currentFeedRate: p.currentFeedRate ?? 0,
      feedConcentration: p.feedConcentration ?? 500,
      liquidVolume: p.liquidVolume ?? 5,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── 实验优化 API ──

apiRouter.get('/experiment/history', (_req, res) => {
  // 返回所有批次的终点指标用于优化
  const batches = sqlite.listBatches(100, 0);
  res.json(batches.map((b: any) => ({
    batch_id: b.batch_id, recipe_id: b.recipe_id,
    outcome: b.outcome, notes: b.notes,
  })));
});

apiRouter.post('/experiment/recommend', (req, res) => {
  const { bounds, history } = req.body;
  if (!bounds || bounds.length === 0) return res.status(400).json({ error: '缺少参数范围定义(bounds)' });

  try {
    const optimizer = new BayesianOptimizer(bounds);

    // 加载历史数据
    if (history && history.length > 0) {
      optimizer.loadHistory(history.map((h: any) => ({
        params: h.params,
        outcome: h.outcome,
      })));
    }

    if (!history || history.length < 3) {
      // 数据不足，返回中心点+随机探索
      const suggested: Record<string, number> = {};
      for (const b of bounds) {
        suggested[b.name] = b.min + Math.random() * (b.max - b.min);
        if (b.step) suggested[b.name] = Math.round(suggested[b.name] / b.step) * b.step;
      }
      return res.json({
        suggestedParams: suggested,
        expectedImprovement: 0,
        confidence: 0.1,
        message: `历史数据不足(${history?.length || 0}条), 需要至少3条才能启动贝叶斯优化, 当前为随机探索`,
        best: optimizer.getBest(),
      });
    }

    // 贝叶斯优化推荐
    const result = optimizer.recommend();
    const recommended = result.suggestedParams;
    const best = optimizer.getBest();
    // 对齐step精度
    for (const b of bounds) {
      if (b.step && recommended[b.name] !== undefined) {
        recommended[b.name] = Math.round(recommended[b.name] / b.step) * b.step;
      }
    }

    res.json({
      suggestedParams: recommended,
      expectedImprovement: best ? (best.outcome * 0.1) : 0,
      confidence: Math.min(0.95, 0.3 + history.length * 0.05),
      message: `基于${history.length}条历史数据的贝叶斯优化(GP+UCB)推荐`,
      best: best ? { params: best.params, outcome: best.outcome } : null,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── 设备配置 API (反应器组态管理) ──

// M2.5: 合法的 category 枚举值 (与 sqlite-service 的白名单保持一致)
const VALID_REACTOR_CATEGORIES = new Set(['fermenter', 'bioreactor', 'centrifuge', 'purification', 'mixer', 'other']);

apiRouter.get('/reactor-configs', (_req, res) => {
  res.json(sqlite.listReactorConfigs());
});

apiRouter.get('/reactor-configs/:id', (req, res) => {
  const config = sqlite.getReactorConfig(req.params.id);
  if (!config) return res.status(404).json({ error: '设备不存在' });
  res.json(config);
});

apiRouter.post('/reactor-configs', (req, res) => {
  const { reactor_id, name, category } = req.body;
  if (!reactor_id || !name) return res.status(400).json({ error: '缺少reactor_id或name' });
  // 校验ID格式: 仅限英文字母、数字、下划线、短横线，1~20字符
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(reactor_id)) return res.status(400).json({ error: 'reactor_id仅限英文字母、数字、下划线、短横线，1~20字符' });
  // M2.5: 校验 category (可选, 缺省 sqlite-service 回退 fermenter)
  if (category !== undefined && !VALID_REACTOR_CATEGORIES.has(category)) {
    return res.status(400).json({ error: `非法 category, 合法值: ${[...VALID_REACTOR_CATEGORIES].join('/')}` });
  }
  const existing = sqlite.getReactorConfig(reactor_id);
  if (existing) return res.status(409).json({ error: `${reactor_id}已存在` });
  sqlite.upsertReactorConfig(req.body);
  res.json({ success: true, reactor_id });
});

apiRouter.put('/reactor-configs/:id', (req, res) => {
  const existing = sqlite.getReactorConfig(req.params.id);
  if (!existing) return res.status(404).json({ error: '设备不存在' });
  // M2.5: 如果 body 携带 category, 校验其合法性
  if (req.body.category !== undefined && !VALID_REACTOR_CATEGORIES.has(req.body.category)) {
    return res.status(400).json({ error: `非法 category, 合法值: ${[...VALID_REACTOR_CATEGORIES].join('/')}` });
  }
  sqlite.upsertReactorConfig({ ...existing, ...req.body, reactor_id: req.params.id });
  res.json({ success: true });
});

apiRouter.delete('/reactor-configs/:id', (req, res) => {
  sqlite.deleteReactorConfig(req.params.id);
  res.json({ success: true });
});

// 初始化默认设备: 如果reactor_configs为空,写入F01
apiRouter.post('/reactor-configs/init-defaults', (_req, res) => {
  const existing = sqlite.listReactorConfigs();
  if (existing.length > 0) return res.json({ message: `已有${existing.length}个设备配置` });
  sqlite.upsertReactorConfig({
    reactor_id: 'F01', name: '5L研发罐 #1', description: '默认发酵罐',
    vessel_volume_L: 5, plc_protocol: 's7', plc_ip: '192.168.2.1', plc_port: 102,
    enabled: 1, sort_order: 0,
  });
  res.json({ success: true, count: 1 });
});

// ── 多反应器管理 API ──

import { ReactorManager } from '../../batch-engine/src/reactor-manager';
import type { BatchControllerConfig } from '../../batch-engine/src/batch-controller';
import { checkInterlocks } from '../../batch-engine/src/index';

const reactorManager = new ReactorManager();

// GET /api/reactors — 列出所有反应器
/**
 * @openapi
 * /reactors:
 *   get:
 *     summary: 列出所有运行时反应器
 *     tags: [Reactors]
 *     responses:
 *       200:
 *         description: 反应器实时状态列表 (来自 ReactorManager 内存)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/UnifiedResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: string, example: "Reactor-1" }
 *                           state: { type: string, enum: [idle, running, held, paused, stopped, complete] }
 *                           batchId: { type: string }
 */
apiRouter.get('/reactors', (_req, res) => {
  res.json(reactorManager.listReactors());
});

// GET /api/reactors/:id/status — 单个反应器状态
/**
 * @openapi
 * /reactors/{id}/status:
 *   get:
 *     summary: 获取单反应器完整状态 (含 phase 列表 + 当前 step)
 *     tags: [Reactors]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "Reactor-1" }
 *     responses:
 *       200:
 *         description: 反应器状态完整快照
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/UnifiedResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         state: { type: string, enum: [idle, running, held, paused, stopped, complete] }
 *                         phase_index: { type: integer }
 *                         phase_id: { type: string }
 *                         total_phases: { type: integer }
 *                         step_number: { type: integer }
 *                         total_steps: { type: integer }
 *                         step_name: { type: string }
 *                         batch_elapsed_sec: { type: integer }
 *                         buttons:
 *                           type: object
 *                           description: 各操作按钮的可用性 (start/pause/stop/reset 等)
 *                         phase_statuses:
 *                           type: array
 *                           items: { type: object }
 *       404: { description: 反应器不存在 }
 */
apiRouter.get('/reactors/:id/status', (req, res) => {
  const ctrl = reactorManager.getReactor(req.params.id);
  if (!ctrl) return res.status(404).json({ error: `反应器 ${req.params.id} 不存在` });
  res.json({
    id: req.params.id,
    state: ctrl.currentState,
    buttons: ctrl.buttons,
    phase_statuses: ctrl.getPhaseStatuses(),
  });
});

// ── RF / IL 状态机连锁与运行故障 API (关联到状态机) ──

// 所有 IL / RF 定义的元数据 (来自 06_ISA-88状态机规格 + running-fault-monitor.ts)
const INTERLOCK_META: { id: string; name: string; description: string; severity: 'critical' | 'warning' }[] = [
  { id: 'IL-01', name: '传感器信号',   description: 'AI-0~AI-5 全部 4-20mA 有效 (>3.8mA)',                  severity: 'critical' },
  { id: 'IL-02', name: '变频器',       description: 'VFD 通讯正常且故障码=0',                                  severity: 'critical' },
  { id: 'IL-03', name: '蒸汽阀关闭',   description: '启动前蒸汽阀必须关到位 (防止意外灭菌)',                  severity: 'critical' },
  { id: 'IL-04', name: '冷却阀关闭',   description: '启动前冷却阀必须关到位',                                  severity: 'critical' },
  { id: 'IL-05', name: '急停状态',     description: 'I0.0 硬件急停未按下',                                     severity: 'critical' },
  { id: 'IL-06', name: '罐盖限位',     description: '罐盖限位开关确认已锁紧',                                   severity: 'critical' },
  { id: 'IL-07', name: 'PLC心跳',      description: 'VB400/VB401 双向心跳正常 (证明 PLC 程序在跑)',            severity: 'critical' },
  { id: 'IL-08', name: '配方状态',     description: '已下载配方且 status=approved',                             severity: 'critical' },
  { id: 'IL-09', name: '数据库可写',   description: 'InfluxDB 和 SQLite 连接正常可写入',                         severity: 'critical' },
  { id: 'IL-10', name: '蒸汽供气',     description: '蒸汽压力开关 > 0.5bar (警告级, 不阻止启动)',               severity: 'warning' },
];

const RUNNING_FAULT_META: { code: string; name: string; description: string; severity: 'critical' | 'warning'; holdAction?: string }[] = [
  { code: 'RF-01', name: '变频器故障',          description: 'VFD_FAULT_CODE 非零',                                     severity: 'critical', holdAction: '搅拌急停' },
  { code: 'RF-02', name: 'VFD通讯超时',         description: 'VFD 连续 >3s 无响应或同值',                               severity: 'critical', holdAction: '搅拌急停' },
  { code: 'RF-03', name: '温度偏差过大',        description: '|PV-SP| > 2°C 持续 3min',                                 severity: 'critical', holdAction: '温度PID继续运行' },
  { code: 'RF-04', name: 'pH偏差过大(泵满速)', description: '|PV-SP| > 0.5 且补料/校正泵满速 持续 5min',              severity: 'critical', holdAction: '补料泵停' },
  { code: 'RF-05', name: 'DO过低',              description: 'DO < 5% 持续 5min',                                        severity: 'critical', holdAction: '补料泵停' },
  { code: 'RF-06', name: '罐压过高',            description: 'PRESSURE > 2.5bar',                                        severity: 'critical', holdAction: '排气全开, 蒸汽关' },
  { code: 'RF-07', name: '传感器断线',          description: '通道 raw < 100 (低于 3.6mA)',                              severity: 'warning' },
  { code: 'RF-08', name: '传感器饱和',          description: '通道 raw > 28000 (高于 20.5mA)',                           severity: 'warning' },
  { code: 'RF-09', name: '称重无变化(泵运行)', description: '补料泵 >0 但称重 30min 无变化 (疑似泵失效)',             severity: 'warning', holdAction: '补料泵停' },
  { code: 'RF-10', name: '疑似泡沫事件',        description: '称重突增 >5% 且所有泵关停',                                severity: 'warning', holdAction: '消泡泵脉冲' },
  { code: 'RF-11', name: 'PLC通讯断线',         description: '心跳丢失, 由 CommWatchdog 触发',                           severity: 'critical', holdAction: '全部进入 Hold' },
];

// GET /api/reactors/:id/interlocks — 当前反应器启动前连锁 (IL) 实时状态
apiRouter.get('/reactors/:id/interlocks', async (req, res) => {
  const ctrl = reactorManager.getReactor(req.params.id);
  if (!ctrl) {
    // 反应器未注册时返回纯元数据 (未执行检测)
    return res.json({
      reactor_id: req.params.id,
      all_passed: false,
      checked: false,
      items: INTERLOCK_META.map(m => ({ ...m, passed: false, detail: '反应器未注册' })),
    });
  }
  // 调用已注入的 plcRead 执行实时 interlock 检测
  try {
    const cfg = (ctrl as any).config as BatchControllerConfig;
    const result = await checkInterlocks(cfg.plcRead);
    // 合并元数据和实时结果
    const byId = new Map(result.results.map((r: any) => [r.id, r]));
    const items = INTERLOCK_META.map(m => {
      const r = byId.get(m.id);
      return {
        ...m,
        passed: r?.passed ?? false,
        detail: r?.detail ?? '未检测',
      };
    });
    res.json({
      reactor_id: req.params.id,
      all_passed: result.allPassed,
      checked: true,
      items,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/reactors/:id/running-faults — 运行故障 (RF) 列表 (纯元数据, 实时触发由 WS alarm 推送)
apiRouter.get('/reactors/:id/running-faults', (_req, res) => {
  res.json({
    items: RUNNING_FAULT_META,
  });
});

// POST /api/reactors — 注册新反应器
apiRouter.post('/reactors', (req, res) => {
  const { reactorId } = req.body;
  if (!reactorId) return res.status(400).json({ error: '缺少 reactorId' });
  try {
    // 占位config: 实际生产中由PLC连接配置注入
    const config: BatchControllerConfig = {
      // 开发模式: 返回"健康"值使interlock通过
      plcRead: async (tag: string) => {
        if (MOCK_PLC) return devPlcRead(tag);
        // 真实 PLC 读取 (待硬件就绪时通过 plc-driver 实现)
        throw new Error(`PLC 未连接, 无法读取 ${tag}. 请设置 MOCK_PLC=true 进行开发演示, 或配置真实 PLC 连接.`);
      },
      plcWrite: async (_tag: string, _value: number) => {},
      pollIntervalMs: 1000,
      getTemplateSteps: getTemplateStepsFromDB,
      getInterlockConfigs: getInterlockConfigsFromDB,
    };
    reactorManager.addReactor(reactorId, config);
    wireReactorEvents(reactorId);
    res.json({ success: true, message: `反应器 ${reactorId} 已注册` });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// POST /api/reactors/:id/download-recipe — 下载配方到指定罐子
/**
 * @openapi
 * /reactors/{id}/download-recipe:
 *   post:
 *     summary: 下载已锁定 (approved) 配方到指定反应器
 *     tags: [Reactors]
 *     description: |
 *       配方必须是 status=approved 才能下载. 下载后反应器进入"已就绪"状态可启动批次.
 *       此操作会触发 WS 广播 `recipe_downloaded` 事件给所有客户端.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "Reactor-1" }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [recipe_id]
 *             properties:
 *               recipe_id: { type: string, example: "ECOLI_V1" }
 *               version: { type: string, example: "1.0.0", description: "省略时取最新" }
 *     responses:
 *       200:
 *         description: 下载成功
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/UnifiedResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         success: { type: boolean }
 *                         message: { type: string }
 *                         reactor_id: { type: string }
 *                         recipe_id: { type: string }
 *                         recipe_name: { type: string }
 *                         phases_count: { type: integer }
 *       404: { description: 配方不存在 }
 *       400: { description: 缺少 recipe_id }
 */
apiRouter.post('/reactors/:id/download-recipe', async (req, res) => {
  const { recipe_id, version } = req.body;
  if (!recipe_id) return res.status(400).json({ error: '缺少 recipe_id' });

  // 1. 获取配方
  const recipeRow = sqlite.getRecipe(recipe_id, version);
  if (!recipeRow) return res.status(404).json({ error: `配方 ${recipe_id} v${version || 'latest'} 不存在` });

  const recipe = parseRecipeRow(recipeRow);

  // 2. 注册反应器 (如果不存在则自动创建)
  const reactorId = req.params.id;
  if (!reactorManager.has(reactorId)) {
    const config: BatchControllerConfig = {
      // 开发模式: 返回"健康"值使interlock通过
      plcRead: async (tag: string) => {
        if (MOCK_PLC) return devPlcRead(tag);
        // 真实 PLC 读取 (待硬件就绪时通过 plc-driver 实现)
        throw new Error(`PLC 未连接, 无法读取 ${tag}. 请设置 MOCK_PLC=true 进行开发演示, 或配置真实 PLC 连接.`);
      },
      plcWrite: async (_tag: string, _value: number) => {},
      pollIntervalMs: 1000,
      getTemplateSteps: getTemplateStepsFromDB,
    };
    reactorManager.addReactor(reactorId, config);
    wireReactorEvents(reactorId);
  }

  // 3. 存储配方到反应器 (供后续启动使用)
  const ctrl = reactorManager.getReactor(reactorId)!;

  // 存储已下载的配方信息到内存 (用于启动时)
  (ctrl as any)._downloadedRecipe = recipe;
  (ctrl as any)._downloadedAt = new Date().toISOString();

  // 广播配方下载事件 (前端不再轮询)
  broadcast('recipe_downloaded', {
    reactor_id: reactorId,
    recipe_id: recipe.recipe_id,
    recipe_name: recipe.name,
    version: recipe.version,
    phases: recipe.phases || [],
    execution_mode: (recipe as any).execution_mode || 'free',
    downloaded_at: (ctrl as any)._downloadedAt,
  }, null, reactorId);

  res.json({
    success: true,
    message: `配方 ${recipe.name} v${recipe.version} 已下载到 ${reactorId}`,
    reactor_id: reactorId,
    recipe_id: recipe.recipe_id,
    recipe_name: recipe.name,
    phases_count: recipe.phases?.length || 0,
  });
});

// GET /api/reactors/:id/recipe — 获取罐子当前已下载的配方
apiRouter.get('/reactors/:id/recipe', (req, res) => {
  const ctrl = reactorManager.getReactor(req.params.id);
  if (!ctrl) return res.json({ downloaded: false });
  const recipe = (ctrl as any)._downloadedRecipe;
  if (!recipe) return res.json({ downloaded: false });
  res.json({
    downloaded: true,
    recipe_id: recipe.recipe_id,
    recipe_name: recipe.name,
    version: recipe.version,
    phases_count: recipe.phases?.length || 0,
    downloaded_at: (ctrl as any)._downloadedAt,
  });
});

// POST /api/reactors/:id/start — 用已下载的配方启动批次
apiRouter.post('/reactors/:id/start', async (req, res) => {
  const ctrl = reactorManager.getReactor(req.params.id);
  if (!ctrl) return res.status(404).json({ error: '反应器不存在' });

  const recipe = (ctrl as any)._downloadedRecipe;
  if (!recipe) return res.status(400).json({ error: '未下载配方，请先下载配方到此罐' });

  // 批次号必须由前端提供 (统计报表/追溯需要), 空串或 undefined 直接拒绝
  const suppliedBatchId = (req.body?.batch_id || '').toString().trim();
  if (!suppliedBatchId) {
    return res.status(400).json({ error: '批次号必填, 请在配方主控输入批次号后再启动' });
  }
  // 允许字母/数字/下划线/短横线, 其它字符一律拒绝
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(suppliedBatchId)) {
    return res.status(400).json({ error: '批次号仅允许字母数字下划线短横线 (1-40 字符)' });
  }
  const batchId = suppliedBatchId;

  try {
    const result = await ctrl.start(recipe, batchId);
    if (result.success) {
      // 记录批次到SQLite
      try {
        sqlite.createBatch({
          batch_id: batchId, recipe_id: recipe.recipe_id, recipe_version: recipe.version,
          reactor_id: req.params.id, organism: recipe.target_organism,
          operator_id: 'admin-001', total_phases: recipe.phases?.length || 0,
        });
      } catch { /* ignore if batch table has issues */ }
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// DELETE /api/reactors/:id — 移除反应器
apiRouter.delete('/reactors/:id', (req, res) => {
  reactorManager.removeReactor(req.params.id);
  res.json({ success: true });
});

// ── Phase级控制 API ──

// GET /api/reactors/:reactorId/phases — 获取所有phase状态
apiRouter.get('/reactors/:reactorId/phases', (req, res) => {
  const ctrl = reactorManager.getReactor(req.params.reactorId);
  if (!ctrl) return res.status(404).json({ error: '反应器不存在' });
  res.json(ctrl.getPhaseStatuses());
});

// POST /api/reactors/:reactorId/phases/:phaseRef/start
// phaseRef may be a numeric index (deprecated) or a nodeId string (preferred).
// Numeric path emits Deprecation + Sunset headers; T24 will remove the numeric branch.
apiRouter.post('/reactors/:reactorId/phases/:phaseRef/start', (req, res) => {
  const ctrl = reactorManager.getReactor(req.params.reactorId);
  if (!ctrl) return res.status(404).json({ error: '反应器不存在' });
  const ref = req.params.phaseRef;
  if (/^\d+$/.test(ref)) {
    // Deprecated: numeric index path
    res.set('Deprecation', 'true').set('Sunset', '2026-12-01');
    const result = ctrl.startPhaseByIndex(parseInt(ref));
    if (!result.success) return res.status(400).json({ error: result.message });
    return res.json({ success: true });
  }
  // New: nodeId path
  const result = ctrl.startPhase(ref);
  if (!result.success) return res.status(400).json({ error: result.message });
  res.json({ success: true });
});

// POST /api/reactors/:reactorId/phases/:phaseRef/hold
// phaseRef may be a numeric index (deprecated) or a nodeId string (preferred).
apiRouter.post('/reactors/:reactorId/phases/:phaseRef/hold', (req, res) => {
  const ctrl = reactorManager.getReactor(req.params.reactorId);
  if (!ctrl) return res.status(404).json({ error: '反应器不存在' });
  const ref = req.params.phaseRef;
  if (/^\d+$/.test(ref)) {
    // Deprecated: numeric index path
    res.set('Deprecation', 'true').set('Sunset', '2026-12-01');
    ctrl.holdPhaseByIndex(parseInt(ref), req.body.reason);
    return res.json({ success: true });
  }
  // New: nodeId path
  ctrl.holdPhase(ref, req.body.reason);
  res.json({ success: true });
});

// POST /api/reactors/:reactorId/phases/:phaseRef/skip
// phaseRef may be a numeric index (deprecated) or a nodeId string (preferred).
apiRouter.post('/reactors/:reactorId/phases/:phaseRef/skip', (req, res) => {
  const ctrl = reactorManager.getReactor(req.params.reactorId);
  if (!ctrl) return res.status(404).json({ error: '反应器不存在' });
  const ref = req.params.phaseRef;
  if (/^\d+$/.test(ref)) {
    // Deprecated: numeric index path
    res.set('Deprecation', 'true').set('Sunset', '2026-12-01');
    ctrl.skipPhaseByIndex(parseInt(ref));
    return res.json({ success: true });
  }
  // New: nodeId path
  ctrl.skipPhase(ref);
  res.json({ success: true });
});

// POST /api/reactors/:reactorId/phases/:phaseRef/restart
// phaseRef may be a numeric index (deprecated) or a nodeId string (preferred).
apiRouter.post('/reactors/:reactorId/phases/:phaseRef/restart', (req, res) => {
  const ctrl = reactorManager.getReactor(req.params.reactorId);
  if (!ctrl) return res.status(404).json({ error: '反应器不存在' });
  const ref = req.params.phaseRef;
  if (/^\d+$/.test(ref)) {
    // Deprecated: numeric index path
    res.set('Deprecation', 'true').set('Sunset', '2026-12-01');
    ctrl.restartPhaseByIndex(parseInt(ref));
    return res.json({ success: true });
  }
  // New: nodeId path
  ctrl.restartPhase(ref);
  res.json({ success: true });
});

// ── 批次级控制 API (暂停/恢复/放弃/急停/复位) ──

apiRouter.post('/reactors/:id/pause', (req, res) => {
  const ctrl = reactorManager.getReactor(req.params.id);
  if (!ctrl) return res.status(404).json({ error: '反应器不存在' });
  ctrl.pause();
  res.json({ success: true, state: ctrl.currentState });
});

apiRouter.post('/reactors/:id/unpause', (req, res) => {
  const ctrl = reactorManager.getReactor(req.params.id);
  if (!ctrl) return res.status(404).json({ error: '反应器不存在' });
  ctrl.unpause();
  res.json({ success: true, state: ctrl.currentState });
});

apiRouter.post('/reactors/:id/hold', (req, res) => {
  const ctrl = reactorManager.getReactor(req.params.id);
  if (!ctrl) return res.status(404).json({ error: '反应器不存在' });
  ctrl.hold(req.body.reason);
  res.json({ success: true, state: ctrl.currentState });
});

apiRouter.post('/reactors/:id/restart', (req, res) => {
  const ctrl = reactorManager.getReactor(req.params.id);
  if (!ctrl) return res.status(404).json({ error: '反应器不存在' });
  ctrl.restart();
  res.json({ success: true, state: ctrl.currentState });
});

apiRouter.post('/reactors/:id/stop', (req, res) => {
  const ctrl = reactorManager.getReactor(req.params.id);
  if (!ctrl) return res.status(404).json({ error: '反应器不存在' });
  ctrl.stop();
  res.json({ success: true, state: ctrl.currentState });
});

apiRouter.post('/reactors/:id/estop', (req, res) => {
  const ctrl = reactorManager.getReactor(req.params.id);
  if (!ctrl) return res.status(404).json({ error: '反应器不存在' });
  ctrl.estop();
  res.json({ success: true, state: ctrl.currentState });
});

apiRouter.post('/reactors/:id/reset', (req, res) => {
  const ctrl = reactorManager.getReactor(req.params.id);
  if (!ctrl) return res.status(404).json({ error: '反应器不存在' });
  ctrl.reset();
  // 清除已下载配方
  (ctrl as any)._downloadedRecipe = null;
  (ctrl as any)._downloadedAt = null;
  res.json({ success: true, state: ctrl.currentState });
});

// ── AI建议 API (ai_suggestions表) ──

apiRouter.get('/ai/suggestions', (req, res) => {
  const status = req.query.status as string || 'pending';
  const batchId = req.query.batch_id as string | undefined;
  if (status === 'pending') {
    // 先过期已超时的建议
    sqlite.expirePendingSuggestions(batchId || '');
    res.json(sqlite.getPendingSuggestions(batchId));
  } else {
    const rows = sqlite.getDatabase().prepare(
      batchId
        ? 'SELECT * FROM ai_suggestions WHERE batch_id = ? AND status = ? ORDER BY created_at DESC LIMIT 50'
        : 'SELECT * FROM ai_suggestions WHERE status = ? ORDER BY created_at DESC LIMIT 50'
    ).all(...(batchId ? [batchId, status] : [status]));
    res.json(rows);
  }
});

apiRouter.post('/ai/suggestions/:id/accept', (req: any, res) => {
  try {
    sqlite.acceptSuggestion(parseInt(req.params.id), req.user?.user_id || 'admin-001');
    sqlite.writeAuditLog({
      user_id: req.user?.user_id || 'admin-001',
      action: 'ai_suggestion_accept',
      target_type: 'ai_suggestion',
      target_id: req.params.id,
      ip_address: req.ip || req.socket?.remoteAddress || null,
      trace_id: req.trace_id,
    });
    // 广播建议被采纳事件
    broadcast('ai_suggestion', { id: parseInt(req.params.id), action: 'accepted' });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

apiRouter.post('/ai/suggestions/:id/reject', (req: any, res) => {
  try {
    sqlite.rejectSuggestion(parseInt(req.params.id), req.user?.user_id || 'admin-001');
    sqlite.writeAuditLog({
      user_id: req.user?.user_id || 'admin-001',
      action: 'ai_suggestion_reject',
      target_type: 'ai_suggestion',
      target_id: req.params.id,
      ip_address: req.ip || req.socket?.remoteAddress || null,
      trace_id: req.trace_id,
    });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// ── AI配置 API ──

apiRouter.get('/settings/ai', (_req, res) => {
  try {
    const row: any = sqlite.getDatabase().prepare(
      "SELECT value FROM settings WHERE key = 'ai_config'"
    ).get();
    res.json(row ? JSON.parse(row.value) : {
      ollama_url: 'http://localhost:11434',
      model: 'gemma4',
      cloud_api_key: '',
      cloud_provider: 'anthropic',
    });
  } catch {
    res.json({ ollama_url: 'http://localhost:11434', model: 'gemma4', cloud_api_key: '', cloud_provider: 'anthropic' });
  }
});

apiRouter.put('/settings/ai', (req, res) => {
  const db = sqlite.getDatabase();
  // 确保settings表存在
  db.prepare(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
  db.prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('ai_config', ?, datetime('now'))`)
    .run(JSON.stringify(req.body));
  res.json({ success: true });
});

// ── 数据维护 API ──

apiRouter.get('/settings/data-maintenance', (_req, res) => {
  try {
    const db = sqlite.getDatabase();
    db.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))`).run();
    const row: any = db.prepare("SELECT value FROM settings WHERE key = 'data_maintenance'").get();
    res.json(row ? JSON.parse(row.value) : {
      auto_backup: false, backup_interval_h: 24, retention_days: 365, log_cleanup_days: 90,
    });
  } catch {
    res.json({ auto_backup: false, backup_interval_h: 24, retention_days: 365, log_cleanup_days: 90 });
  }
});

apiRouter.put('/settings/data-maintenance', (req, res) => {
  const db = sqlite.getDatabase();
  db.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))`).run();
  db.prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('data_maintenance', ?, datetime('now'))`)
    .run(JSON.stringify(req.body));
  res.json({ success: true });
});

apiRouter.post('/settings/data-maintenance/backup', (_req, res) => {
  try {
    const backupPath = `${DATA_DIR}/backups`;
    mkdirSync(backupPath, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const destFile = `${backupPath}/biocore_${timestamp}.db`;
    sqlite.getDatabase().backup(destFile);
    res.json({ success: true, path: destFile, timestamp });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

apiRouter.post('/settings/data-maintenance/cleanup', (req, res) => {
  const { days } = req.body;
  const cutoff = new Date(Date.now() - (days || 90) * 86400000).toISOString();
  const db = sqlite.getDatabase();
  // 清理旧的state_transitions和step_logs (保留batches和audit_logs)
  const r1 = db.prepare('DELETE FROM state_transitions WHERE timestamp < ? AND batch_id IN (SELECT batch_id FROM batches WHERE current_state IN (\'complete\',\'stopped\'))').run(cutoff);
  const r2 = db.prepare('DELETE FROM step_logs WHERE started_at < ? AND batch_id IN (SELECT batch_id FROM batches WHERE current_state IN (\'complete\',\'stopped\'))').run(cutoff);
  res.json({ success: true, transitions_deleted: r1.changes, steps_deleted: r2.changes });
});

// ── WebSocket 广播集成 (状态变更/报警/步骤进度) ──

// 监听BatchController事件并广播到WebSocket
function wireReactorEvents(reactorId: string): void {
  const ctrl = reactorManager.getReactor(reactorId);
  if (!ctrl) return;

  // 启动该反应器的 InfluxDB 时序采集
  startReactorCollector(reactorId);

  // 状态变更广播
  ctrl.on('state_changed', (state: string) => {
    broadcast('state_update', {
      reactor_id: reactorId,
      state,
    }, null, reactorId);

    // 批次进入 running 时初始化 CUSUM 基线
    if (state === 'running' && ctrl.currentBatchId) {
      const detMap = getCusumKey(ctrl.currentBatchId);
      initCusumBaselines(detMap);
      console.log(`[${new Date().toISOString()}] [INFO] [CUSUM] 批次 ${ctrl.currentBatchId} 检测器已初始化`);
    }
  });

  // 完整状态更新(含phase/step)
  ctrl.on('state_update', (data: any) => {
    broadcast('state_update', { reactor_id: reactorId, ...data }, data?.batch_id, reactorId);
  });

  // Phase启动/完成 — T16: payload_version=2 + node_id; phase_index retained for legacy v1 consumers (remove in T24)
  ctrl.on('phase_started', (data: any) => {
    broadcast('step_progress', {
      reactor_id: reactorId,
      event: 'phase_started',
      payload_version: 2,
      batch_id: ctrl.currentBatchId,
      node_id: ctrl.currentNodeId,
      phase_id: data.phase_id,
      phase_type: data.phase_type,
      phase_index: data.index ?? data.phase_index,   // legacy for v1 consumers; remove in T24
      total_steps: data.total_steps,
    }, null, reactorId);
  });
  ctrl.on('phase_completed', (data: any) => {
    broadcast('step_progress', {
      reactor_id: reactorId,
      event: 'phase_completed',
      payload_version: 2,
      batch_id: ctrl.currentBatchId,
      node_id: ctrl.currentNodeId,
      phase_id: data.phase_id,
      phase_type: data.phase_type,
      phase_index: data.index ?? data.phase_index,   // legacy for v1 consumers; remove in T24
    }, null, reactorId);
  });

  // T15: branch_evaluated 审计桥 — DAG 分支求值结果落到 audit_logs
  // (T13 controller 端已发出该事件; 这里是 server 端唯一的 audit/broadcast 落点)
  ctrl.on('branch_evaluated', (data: any) => {
    // 广播给前端，用于在 DAG 视图上回放分支决策 — T16: payload_version=2 + explicit node_id
    broadcast('branch_evaluated', {
      reactor_id: reactorId,
      type: 'branch_evaluated',
      payload_version: 2,
      batch_id: data?.batch_id ?? ctrl.currentBatchId,
      node_id: data?.node_id ?? null,
      expression: data?.expression,
      result: data?.result,
      skipped: data?.skipped,
      pv_snapshot: data?.pv_snapshot,
    }, data?.batch_id, reactorId);
    // 写入审计日志 (target_kind = 'node_id', graceful 兜底 'unknown')
    try {
      sqlite.writeAuditLog({
        user_id: 'system',
        action: 'branch_evaluated',
        target_type: 'branch',
        target_id: data?.node_id ?? 'unknown',
        target_kind: 'node_id',
        batch_id: ctrl.currentBatchId || undefined,
        new_value: JSON.stringify({
          expression: data?.expression,
          result: data?.result,
          skipped: data?.skipped,
          pv_snapshot: data?.pv_snapshot,
        }),
      });
    } catch (e) {
      console.warn(`[AUDIT] branch_evaluated 写入失败:`, (e as Error).message);
    }
  });

  // Step完成
  ctrl.on('step_completed', (log: any) => {
    broadcast('step_progress', { reactor_id: reactorId, event: 'step_completed', ...log }, null, reactorId);
  });

  // 报警广播
  ctrl.on('alarm', (data: any) => {
    broadcast('alarm', { reactor_id: reactorId, ...data }, data?.batch_id, reactorId);
    // 同时写入数据库
    try {
      sqlite.createAlarm({
        batch_id: data.batch_id,
        alarm_code: data.alarm_code || data.code || 'UNKNOWN',
        severity: data.severity || 'warning',
        source: data.source || 'node:batch-engine',
        message: data.message || '',
      });
    } catch { /* ignore */ }
  });

  // 批次完成/停止
  ctrl.on('batch_completed', (data: any) => {
    broadcast('state_update', { reactor_id: reactorId, event: 'batch_completed', ...data }, data?.batch_id, reactorId);
    if (data?.batch_id) clearCusumDetectors(data.batch_id);  // P1 修复: 清理内存
    // KPI + SPC 自动计算 (参考 DELMIA Apriso MPI)
    if (data?.batch_id) {
      try {
        computeKpi(sqlite.getDatabase(), data.batch_id);
        console.log(`[KPI] 批次 ${data.batch_id} KPI 已自动计算`);
      } catch (e) { console.warn(`[KPI] 自动计算失败:`, (e as Error).message); }
      // DOE 自动响应收集: 检查该批次是否关联了 DOE run
      try {
        const db = sqlite.getDatabase();
        const doeRun: any = db.prepare('SELECT study_id, run_index FROM doe_runs WHERE batch_id = ? AND status = ?').get(data.batch_id, 'running');
        if (doeRun) {
          const responses = autoCollectDoeResponses(db, doeRun.study_id, doeRun.run_index);
          if (responses && Object.keys(responses).length > 0) {
            sqlite.setDoeRunResponse(doeRun.study_id, doeRun.run_index, responses);
            console.log(`[DOE] 批次 ${data.batch_id} → 研究 ${doeRun.study_id} Run#${doeRun.run_index} 响应已自动收集:`, responses);
            // 检查研究是否全部完成
            const runs = sqlite.listDoeRuns(doeRun.study_id);
            if (runs.length > 0 && runs.every(r => r.status === 'completed')) {
              sqlite.updateDoeStudyStatus(doeRun.study_id, 'completed');
            }
          }
        }
      } catch (e) { console.warn(`[DOE] 自动响应收集失败:`, (e as Error).message); }
    }
  });
  ctrl.on('batch_stopped', (data: any) => {
    broadcast('state_update', { reactor_id: reactorId, event: 'batch_stopped', ...data }, null, reactorId);
    if (data?.batch_id) clearCusumDetectors(data.batch_id);  // P1 修复: 清理内存
  });
}

// ── 趋势历史数据 (InfluxDB) ──

// 允许查询的字段白名单 (防 Flux 注入)
const TREND_FIELDS = new Set([
  'temperature', 'jacket_temp', 'pH', 'DO', 'pressure',
  'airflow', 'weight', 'rpm', 'vfd_current',
]);
// M2.3: 放宽到 1-10 位数字, 支持 -86400s / -604800s 等 Sprint 2 自定义秒数
const TREND_RANGE_RE = /^-\d{1,10}[smhdw]$|^now\(\)$/;

// GET /api/trends?reactor_id=Reactor-1&fields=temperature,pH,DO&start=-1h&stop=now()
/**
 * @openapi
 * /trends:
 *   get:
 *     summary: 查询时序历史数据 (从 InfluxDB)
 *     tags: [Trends]
 *     parameters:
 *       - in: query
 *         name: reactor_id
 *         required: true
 *         schema: { type: string, example: "Reactor-1" }
 *       - in: query
 *         name: fields
 *         schema: { type: string, default: "temperature,pH,DO" }
 *         description: 逗号分隔字段, 仅允许白名单 (temperature/jacket_temp/pH/DO/pressure/airflow/weight/rpm/vfd_current)
 *       - in: query
 *         name: start
 *         schema: { type: string, default: "-1h", example: "-24h" }
 *         description: Flux 时间范围, 格式 -<数字>[smhdw] 或 now()
 *       - in: query
 *         name: stop
 *         schema: { type: string, default: "now()" }
 *       - in: query
 *         name: max_points
 *         schema: { type: integer, default: 500, minimum: 0, maximum: 5000 }
 *         description: LTTB 下采样目标点数 (M2.1)。默认 500; 0 = 禁用下采样; 超过 5000 会被截断。多字段时对每个字段单独跑 LTTB 后按时间戳 union。
 *       - in: query
 *         name: batch_id
 *         schema: { type: string, example: "B-20260408-001" }
 *         description: |
 *           可选。按 InfluxDB tag `batch_id` 过滤。提供时自动用 `range(start: 0)` 拿全量历史, 忽略 start/stop。
 *           仅允许字符 `[A-Za-z0-9_-]`, 其它字符会被剥离。
 *           注意:2026-04 前的历史数据可能将 downloaded recipe_id 错记为 batch_id (collector bug 已修复), 该过滤对修复后的新数据可靠。
 *     responses:
 *       200:
 *         description: 时序数据点列表 (按时间升序)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/UnifiedResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         reactor_id: { type: string }
 *                         fields: { type: array, items: { type: string } }
 *                         start: { type: string }
 *                         stop: { type: string }
 *                         count: { type: integer }
 *                         data:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               _time: { type: string, format: date-time }
 *                               temperature: { type: number }
 *                               pH: { type: number }
 *                               DO: { type: number }
 *       400: { description: 缺少 reactor_id 或字段非法 }
 *       503: { description: InfluxDB 未配置 }
 */
apiRouter.get('/trends', async (req: any, res) => {
  if (!influxQueryApi) return res.status(503).json({ error: 'InfluxDB 未配置, 无法查询历史数据' });

  const reactorId = String(req.query.reactor_id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!reactorId) return res.status(400).json({ error: '缺少 reactor_id' });

  const rawFields = String(req.query.fields || 'temperature,pH,DO').split(',').map(s => s.trim());
  const fields = rawFields.filter(f => TREND_FIELDS.has(f));
  if (fields.length === 0) return res.status(400).json({ error: '没有合法字段' });

  let start = String(req.query.start || '-1h');
  let stop = String(req.query.stop || 'now()');
  if (!TREND_RANGE_RE.test(start)) start = '-1h';
  if (!TREND_RANGE_RE.test(stop)) stop = 'now()';

  // M2.1: max_points 参数, clamp [0, 5000], 默认 500, 0 = 不下采样
  let maxPoints = parseInt(String(req.query.max_points ?? '500'), 10);
  if (isNaN(maxPoints) || maxPoints < 0) maxPoints = 500;
  if (maxPoints > 5000) maxPoints = 5000;

  // M2.2: batch_id 过滤 (可选), 只允许 [A-Za-z0-9_-]
  const batchIdRaw = String(req.query.batch_id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const batchId = batchIdRaw || null;

  // M2.2: 提供 batch_id 时用 range(start: 0) 拿全量历史 (忽略 start/stop)
  const rangeClause = batchId ? 'range(start: 0)' : `range(start: ${start}, stop: ${stop})`;
  const batchIdFilter = batchId ? `|> filter(fn: (r) => r.batch_id == "${batchId}")` : '';

  const fieldFilter = fields.map(f => `r._field == "${f}"`).join(' or ');
  const flux = `
    from(bucket: "${INFLUX_BUCKET}")
      |> ${rangeClause}
      |> filter(fn: (r) => r._measurement == "process_data")
      |> filter(fn: (r) => r.reactor_id == "${reactorId}")
      ${batchIdFilter}
      |> filter(fn: (r) => ${fieldFilter})
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> sort(columns: ["_time"])
  `;

  try {
    const rawRows: any[] = [];
    await new Promise<void>((resolve, reject) => {
      influxQueryApi!.queryRows(flux, {
        next(row, tableMeta) { rawRows.push(tableMeta.toObject(row)); },
        error(err) { reject(err); },
        complete() { resolve(); },
      });
    });

    // M2.1 LTTB 下采样: 给每个字段单独跑 LTTB, 然后按时间戳 union 合并
    let outRows = rawRows;
    if (maxPoints > 0 && rawRows.length > maxPoints) {
      const tsToRow = new Map<number, any>();
      for (const f of fields) {
        // 提取该字段非空的行
        const fieldRows = rawRows
          .map(r => ({ t: new Date(r._time).getTime(), v: r[f] }))
          .filter(p => p.v !== null && p.v !== undefined && !isNaN(p.v));
        if (fieldRows.length === 0) continue;
        // 该字段如果点数 ≤ maxPoints, 全保留; 否则跑 LTTB
        const sampled = fieldRows.length > maxPoints
          ? lttb(fieldRows, maxPoints, p => p.t, p => p.v)
          : fieldRows;
        // union 到 tsToRow
        for (const p of sampled) {
          if (!tsToRow.has(p.t)) tsToRow.set(p.t, { _time: new Date(p.t).toISOString() });
          tsToRow.get(p.t)![f] = p.v;
        }
      }
      // 按时间排序
      outRows = [...tsToRow.values()].sort((a, b) => new Date(a._time).getTime() - new Date(b._time).getTime());
    }

    res.json({
      reactor_id: reactorId,
      batch_id: batchId,
      fields,
      start: batchId ? '0' : start,
      stop: batchId ? 'now()' : stop,
      max_points: maxPoints,
      count: outRows.length,
      raw_count: rawRows.length,
      data: outRows,
    });
  } catch (e: any) {
    console.error('[Influx query] error:', e?.message || e);
    res.status(500).json({ error: e?.message || 'InfluxDB 查询失败' });
  }
});

// ── 状态 ──

apiRouter.get('/status', (_req, res) => {
  res.json({
    version: '0.1.0',
    uptime: process.uptime(),
    ws_clients: wss.clients.size,
    heartbeats: [...heartbeats.entries()].map(([id, s]) => ({
      id, running: s.running, counter: s.counter, errors: s.errors,
    })),
  });
});

// ═══════════════════════════════════════════════════════════
// 启动
// ═══════════════════════════════════════════════════════════

// P0 修复: 同时处理 SIGINT (Ctrl+C) 和 SIGTERM (docker stop / k8s 优雅关闭)
let shuttingDown = false;
async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[${new Date().toISOString()}] [INFO] [Server] 收到 ${signal}, 优雅关闭中...`);

  // 10 秒强制退出兜底
  const forceTimer = setTimeout(() => {
    console.error(`[${new Date().toISOString()}] [ERROR] [Server] 优雅关闭超时, 强制退出`);
    process.exit(1);
  }, 10000);
  forceTimer.unref();

  try {
    // 1. 停接受新 HTTP 连接
    server.close();
    // 2. 关闭所有 WS 客户端
    wss.clients.forEach(ws => { try { ws.close(1001, 'Server shutting down'); } catch {} });
    // 3. 停心跳 + 采集定时器
    for (const [id] of heartbeats) stopHeartbeat(id);
    for (const [id] of reactorCollectorTimers) stopReactorCollector(id);
    // 4. 清理所有反应器 (调用 destroy, 卸载监听器 + 停定时器)
    for (const r of reactorManager.listReactors()) {
      try { reactorManager.removeReactor(r.id); } catch (e) {
        console.error(`[Shutdown] 反应器 ${r.id} 清理失败:`, (e as Error).message);
      }
    }
    // 5. 停止 AI 建议引擎
    if (suggestionEngineHandle) suggestionEngineHandle.stop();
    // 6. Flush + close InfluxDB
    if (influxWriteApi) {
      try { await influxWriteApi.close(); } catch { /* ignore */ }
    }
    // 6. 关闭 SQLite (确保 WAL 同步)
    sqlite.close();
    // 7. 停 runtime-guard timers (T23: metricsCollector + memWd)
    try { metricsCollector.stop(); } catch { /* ignore */ }
    try { memWd.stop(); } catch { /* ignore */ }
    clearTimeout(forceTimer);
    console.log(`[${new Date().toISOString()}] [INFO] [Server] 已优雅关闭`);
    process.exit(0);
  } catch (e) {
    console.error(`[${new Date().toISOString()}] [ERROR] [Server] 优雅关闭出错:`, (e as Error).message);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║         BIOCore Server v0.1.0                ║
  ║         http://localhost:${PORT}               ║
  ║         WebSocket: ws://localhost:${PORT}/ws    ║
  ╠══════════════════════════════════════════════╣
  ║  SQLite:   ${DATA_DIR}/biocore.db              ║
  ║  安全模式: 测试只读, 地址校验                ║
  ╚══════════════════════════════════════════════╝
  `);

  // 启动 AI 建议生成后台引擎
  suggestionEngineHandle = startSuggestionEngine({
    sqlite,
    feedAdvisor,
    softSensorEngine,
    cusumDetectors,
    broadcast,
    getRunningBatches: () => {
      const running: Array<{ batchId: string; reactorId: string; pv: Record<string, number> }> = [];
      for (const info of reactorManager.listReactors()) {
        const ctrl = reactorManager.getReactor(info.id);
        if (ctrl && ctrl.currentState === 'running' && ctrl.currentBatchId) {
          running.push({
            batchId: ctrl.currentBatchId,
            reactorId: info.id,
            pv: {
              temperature: devPlcRead('TEMP_PV'),
              pH: devPlcRead('PH_PV'),
              DO: devPlcRead('DO_PV'),
              pressure: devPlcRead('PRESSURE_PV'),
              rpm: devPlcRead('VFD_ACTUAL_FREQ') * 24,
            },
          });
        }
      }
      return running;
    },
  });
});

export { app, server, wss, broadcast, sqlite, reactorManager };
