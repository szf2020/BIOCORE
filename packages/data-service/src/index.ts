// ============================================================
// data-service — 双数据库服务层
// 职责: InfluxDB时序写入/查询 + SQLite业务CRUD + 审计日志
// ============================================================

import { InfluxDB, Point, WriteApi, QueryApi } from '@influxdata/influxdb-client';
import type {
  ProcessValues,
  CalculatedParams,
} from '@biocore/types';

// ─── InfluxDB 时序数据服务 ──────────────────────────────────

export class InfluxService {
  private client: InfluxDB;
  private writeApi: WriteApi;
  private queryApi: QueryApi;
  private org: string;
  private bucket: string;

  constructor(config: { url: string; token: string; org: string; bucket: string }) {
    this.org = config.org;
    this.bucket = config.bucket;
    this.client = new InfluxDB({ url: config.url, token: config.token });
    this.writeApi = this.client.getWriteApi(config.org, config.bucket, 's');
    this.queryApi = this.client.getQueryApi(config.org);
  }

  // 写入过程值 (每分钟由 collector.js 调用)
  writeProcessData(pv: ProcessValues): void {
    const point = new Point('process_data')
      .tag('batch_id', pv.batch_id || 'none')
      .tag('reactor_id', 'F01')
      .floatField('temperature', pv['AI-0'])
      .floatField('jacket_temp', pv['AI-1'])
      .floatField('pH', pv['AI-2'])
      .floatField('DO', pv['AI-3'])
      .floatField('pressure', pv['AI-4'])
      .floatField('airflow', pv['AI-5'])
      .floatField('weight', pv['AI-6'])
      .intField('rpm', pv.rpm)
      .floatField('vfd_current', pv.vfd_current)
      .floatField('steam_valve', pv['AO-0_cv'])
      .floatField('cool_valve', pv['AO-1_cv'])
      .floatField('air_valve', pv['AO-2_cv'])
      .floatField('feed_rate_P01', pv.P01_rate)
      .floatField('feed_rate_P02', pv.P02_rate)
      .floatField('feed_rate_P03', pv.P03_rate)
      .floatField('feed_rate_P04', pv.P04_rate)
      .intField('temp_mode', pv.temp_mode)
      .floatField('temp_sv', pv.temp_sv ?? 0)
      .floatField('pH_sv', pv.pH_sv ?? 0)
      .floatField('DO_sv', pv.DO_sv ?? 0)
      .intField('phase_index', pv.phase_index ?? 0)
      .intField('step_number', pv.step_number ?? 0)
      .timestamp(new Date(pv.timestamp));

    this.writeApi.writePoint(point);
  }

  // 写入软件测算值
  writeCalculatedParams(params: CalculatedParams): void {
    const point = new Point('calculated_params')
      .tag('batch_id', params.batch_id)
      .floatField('OUR', params.OUR)
      .floatField('kLa', params.kLa)
      .floatField('mu', params.mu)
      .floatField('Vs', params.Vs)
      .floatField('V_feed', params.V_feed)
      .floatField('V_base', params.V_base)
      .floatField('V_acid', params.V_acid)
      .floatField('O2_total', params.O2_total)
      .floatField('V_liquid', params.V_liquid)
      .timestamp(new Date(params.timestamp));

    if (params.F0 !== undefined) {
      point.floatField('F0', params.F0);
    }

    this.writeApi.writePoint(point);
  }

  // 写入软测量推断值 (v2.0)
  writeSoftSensor(batchId: string, field: string, value: number, confidence: number): void {
    const point = new Point('soft_sensor')
      .tag('batch_id', batchId)
      .floatField(field, value)
      .floatField(`${field}_confidence`, confidence)
      .timestamp(new Date());

    this.writeApi.writePoint(point);
  }

  // 安全: 输入验证辅助
  private static sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_\-]/g, '');
  }
  private static VALID_FIELDS = new Set([
    'temperature', 'jacket_temp', 'pH', 'DO', 'pressure', 'airflow', 'weight',
    'rpm', 'vfd_current', 'steam_valve', 'cool_valve', 'air_valve',
    'feed_rate_P01', 'feed_rate_P02', 'feed_rate_P03', 'feed_rate_P04',
    'temp_mode', 'temp_sv', 'pH_sv', 'DO_sv', 'OUR', 'kLa', 'mu', 'Vs',
  ]);
  private static VALID_RANGE = /^-\d{1,4}[hmd]$|^now\(\)$/;

  // 查询批次趋势数据
  async queryBatchTrend(
    batchId: string,
    fields: string[],
    rangeStart: string = '-24h',
    rangeStop: string = 'now()'
  ): Promise<any[]> {
    // 防注入: 验证所有输入
    const safeBatchId = InfluxService.sanitizeId(batchId);
    const safeFields = fields.filter(f => InfluxService.VALID_FIELDS.has(f));
    if (safeFields.length === 0) return [];
    if (!InfluxService.VALID_RANGE.test(rangeStart)) rangeStart = '-24h';
    if (!InfluxService.VALID_RANGE.test(rangeStop)) rangeStop = 'now()';

    const fieldFilter = safeFields.map(f => `r._field == "${f}"`).join(' or ');
    const query = `
      from(bucket: "${this.bucket}")
        |> range(start: ${rangeStart}, stop: ${rangeStop})
        |> filter(fn: (r) => r._measurement == "process_data")
        |> filter(fn: (r) => r.batch_id == "${safeBatchId}")
        |> filter(fn: (r) => ${fieldFilter})
        |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
    `;
    return this.executeQuery(query);
  }

  // 多批次叠加查询 (按发酵经过时间对齐)
  async queryMultiBatchOverlay(
    batchIds: string[],
    field: string
  ): Promise<Record<string, any[]>> {
    if (!InfluxService.VALID_FIELDS.has(field)) return {};
    const idFilter = batchIds.map(id => `r.batch_id == "${InfluxService.sanitizeId(id)}"`).join(' or ');
    const query = `
      from(bucket: "${this.bucket}")
        |> range(start: -365d)
        |> filter(fn: (r) => r._measurement == "process_data")
        |> filter(fn: (r) => ${idFilter})
        |> filter(fn: (r) => r._field == "${field}")
        |> group(columns: ["batch_id"])
    `;
    const rows = await this.executeQuery(query);
    const result: Record<string, any[]> = {};
    for (const row of rows) {
      const bid = row.batch_id;
      if (!result[bid]) result[bid] = [];
      result[bid].push({ time: row._time, value: row._value });
    }
    return result;
  }

  // 执行任意 Flux 查询 (供 NL→Flux 模块使用)
  async executeFluxQuery(fluxQuery: string): Promise<any[]> {
    return this.executeQuery(fluxQuery);
  }

  private async executeQuery(query: string): Promise<any[]> {
    const rows: any[] = [];
    return new Promise((resolve, reject) => {
      this.queryApi.queryRows(query, {
        next(row, tableMeta) { rows.push(tableMeta.toObject(row)); },
        error(error) { reject(error); },
        complete() { resolve(rows); },
      });
    });
  }

  async flush(): Promise<void> {
    await this.writeApi.flush();
  }

  async close(): Promise<void> {
    await this.writeApi.close();
  }
}

// ─── 重导出 ───────────────────────────────────────────────────

// v1.8.0 bucket 2: canonical SQLiteService is the implementation in ./sqlite-service.ts.
// (Previously this barrel re-exported it as SQLiteServiceNew while the in-file legacy
// class shadowed the public name. Server's deep-import path resolved to the real class;
// the new public path now does the same.)
export { SQLiteService } from './sqlite-service';
export { DataCollector } from './collector';
export type { CollectorConfig, ProcessValues, CalculatedParams } from './collector';

// T35: notification CRUD helpers (consumed by @biocore/server T40 AlertRouter wiring + admin route)
export {
  listChannels,
  upsertChannel,
  deleteChannel,
  listRules,
  setRules,
  type NotificationChannel,
  type NotificationRule,
} from './sqlite-service';

// T12: B1.1 DAG runtime — current_node_id persistence helpers
export { updateBatchCurrentNodeId, getBatchCurrentNodeId } from './sqlite-service';
// B1.2: Loop-frame persistence helpers (migration 024)
export { updateBatchLoopFrames, getBatchLoopFrames } from './sqlite-service';
export type { PersistedLoopFrame } from './sqlite-service';
// v1.7.2: boot-time crash-recovery helpers
export { getOrphanBatches, markBatchHeldForRecovery } from './sqlite-service';
export type { OrphanBatchRow } from './sqlite-service';
// v1.9.0 P2 bucket 2: boot-time RecoveryPolicy abort path
export { markBatchAborted } from './sqlite-service';

// v1.8.0 bucket 2: formula-evaluator public surface (consumed by @biocore/server formula route)
export { validateExpression, evaluateExpression, AVAILABLE_VARS } from './formula-evaluator';

// SCADA 数据模型 (migration 028)
export {
  SCADA_ITEMS_MAX_BYTES,
} from './sqlite-service';
export type { ScadaProjectMeta, ScadaViewMeta, ScadaView } from './sqlite-service';

// SP-FX-19: 审计日志服务
export { insertAuditLog, queryAuditLog } from './audit-log-service';
export type { AuditLogEntry, AuditLogRow, AuditLogQuery } from './audit-log-service';

export { InfluxService as default };
