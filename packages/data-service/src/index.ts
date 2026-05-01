// ============================================================
// data-service — 双数据库服务层
// 职责: InfluxDB时序写入/查询 + SQLite业务CRUD + 审计日志
// ============================================================

import { InfluxDB, Point, WriteApi, QueryApi } from '@influxdata/influxdb-client';
import Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import type {
  ProcessValues,
  CalculatedParams,
  Batch,
  Recipe,
  AuditLog,
  AuditAction,
  Alarm,
  User,
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

// ─── SQLite 业务数据服务 ────────────────────────────────────

export class SQLiteService {
  private db: Database.Database;

  constructor(dbPath: string = './data/biocore.db') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      -- 用户表
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin','engineer','operator','viewer')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_login_at TEXT,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      -- 配方版本管理
      CREATE TABLE IF NOT EXISTS recipes (
        recipe_id TEXT NOT NULL,
        version TEXT NOT NULL,
        name TEXT NOT NULL,
        author TEXT NOT NULL,
        target_organism TEXT,
        vessel_config TEXT NOT NULL,
        phases TEXT NOT NULL,
        metadata TEXT,
        status TEXT NOT NULL DEFAULT 'draft'
          CHECK(status IN ('draft','approved','archived','superseded')),
        approved_by TEXT REFERENCES users(user_id),
        approved_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_by TEXT NOT NULL,
        PRIMARY KEY (recipe_id, version)
      );
      CREATE INDEX IF NOT EXISTS idx_recipes_status ON recipes(status);

      -- 批次主记录
      CREATE TABLE IF NOT EXISTS batches (
        batch_id TEXT PRIMARY KEY,
        recipe_id TEXT NOT NULL,
        recipe_version TEXT NOT NULL,
        reactor_id TEXT NOT NULL DEFAULT 'F01',
        organism TEXT,
        operator_id TEXT NOT NULL,
        started_at TEXT,
        ended_at TEXT,
        current_state TEXT NOT NULL DEFAULT 'idle'
          CHECK(current_state IN ('idle','running','held','paused','stopped','complete')),
        current_phase_index INTEGER DEFAULT 0,
        current_phase_id TEXT,
        current_phase_type TEXT,
        current_step_number INTEGER DEFAULT 0 CHECK(current_step_number BETWEEN 0 AND 255),
        total_phases INTEGER,
        state_snapshot TEXT,
        hold_reason TEXT,
        stop_trigger TEXT CHECK(stop_trigger IN ('cmd_stop','safety_estop')),
        outcome TEXT CHECK(outcome IN ('success','partial','failed','stopped')),
        summary_text TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (recipe_id, recipe_version) REFERENCES recipes(recipe_id, version)
      );
      CREATE INDEX IF NOT EXISTS idx_batches_time ON batches(started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_batches_state ON batches(current_state);

      -- 状态流转日志
      CREATE TABLE IF NOT EXISTS state_transitions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT NOT NULL REFERENCES batches(batch_id),
        from_state TEXT NOT NULL,
        to_state TEXT NOT NULL,
        event TEXT NOT NULL,
        phase_id TEXT,
        step_number INTEGER,
        triggered_by TEXT NOT NULL,
        context TEXT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_st_batch ON state_transitions(batch_id, timestamp);

      -- 不可篡改审计日志
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT,
        old_value TEXT,
        new_value TEXT,
        reason TEXT,
        ip_address TEXT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_audit_batch ON audit_logs(batch_id, timestamp);

      -- 审计日志不可篡改触发器
      CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_logs
      BEGIN SELECT RAISE(ABORT, 'audit_logs表禁止UPDATE操作'); END;

      CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_logs
      BEGIN SELECT RAISE(ABORT, 'audit_logs表禁止DELETE操作'); END;

      -- 报警历史
      CREATE TABLE IF NOT EXISTS alarms (
        id TEXT PRIMARY KEY,
        batch_id TEXT,
        severity TEXT NOT NULL CHECK(severity IN ('info','warning','critical')),
        source TEXT NOT NULL,
        message TEXT NOT NULL,
        channel TEXT,
        value REAL,
        threshold REAL,
        acknowledged INTEGER NOT NULL DEFAULT 0,
        acknowledged_by TEXT,
        acknowledged_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- 离线取样数据
      CREATE TABLE IF NOT EXISTS offline_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT NOT NULL REFERENCES batches(batch_id),
        sample_time TEXT NOT NULL,
        OD600 REAL,
        glucose_g_L REAL,
        acetate_g_L REAL,
        product_titer REAL,
        cell_viability REAL,
        notes TEXT,
        recorded_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- AI会话记录
      CREATE TABLE IF NOT EXISTS ai_sessions (
        id TEXT PRIMARY KEY,
        batch_id TEXT,
        user_id TEXT NOT NULL,
        messages TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- 默认管理员用户 (首次启动)
      INSERT OR IGNORE INTO users (user_id, username, display_name, password_hash, role)
      VALUES ('admin-001', 'admin', '管理员', '$2b$10$placeholder', 'admin');
    `);
  }

  // --- 批次 CRUD ---
  createBatch(batch: Partial<Batch>): void {
    this.db.prepare(`
      INSERT INTO batches (batch_id, recipe_id, recipe_version, reactor_id, organism, operator_id, total_phases, current_state)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'idle')
    `).run(batch.batch_id, batch.recipe_id, batch.recipe_version, batch.reactor_id || 'F01',
      batch.organism, batch.operator_id, batch.total_phases);
  }

  updateBatchState(batchId: string, updates: Partial<Batch>): void {
    const sets: string[] = [];
    const vals: any[] = [];
    for (const [k, v] of Object.entries(updates)) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    vals.push(batchId);
    this.db.prepare(`UPDATE batches SET ${sets.join(', ')} WHERE batch_id = ?`).run(...vals);
  }

  getBatch(batchId: string): Batch | undefined {
    return this.db.prepare('SELECT * FROM batches WHERE batch_id = ?').get(batchId) as Batch | undefined;
  }

  listBatches(limit = 50, offset = 0): Batch[] {
    return this.db.prepare('SELECT * FROM batches ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset) as Batch[];
  }

  // --- 审计日志 ---
  writeAuditLog(log: Omit<AuditLog, 'id' | 'timestamp'>): void {
    this.db.prepare(`
      INSERT INTO audit_logs (batch_id, user_id, action, target_type, target_id, old_value, new_value, reason, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(log.batch_id, log.user_id, log.action, log.target_type, log.target_id,
      log.old_value, log.new_value, log.reason, log.ip_address);
  }

  // --- 状态流转日志 ---
  writeStateTransition(batchId: string, from: string, to: string, event: string, triggeredBy: string, context?: any): void {
    this.db.prepare(`
      INSERT INTO state_transitions (batch_id, from_state, to_state, event, triggered_by, context)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(batchId, from, to, event, triggeredBy, context ? JSON.stringify(context) : null);
  }

  // --- 配方 ---
  getApprovedRecipes(): Recipe[] {
    const rows = this.db.prepare("SELECT * FROM recipes WHERE status = 'approved' ORDER BY recipe_id, version DESC").all() as any[];
    return rows.map(r => ({ ...r, vessel: JSON.parse(r.vessel_config), phases: JSON.parse(r.phases) }));
  }

  getDatabase(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}

// ─── 重导出 ───────────────────────────────────────────────────

export { SQLiteService as SQLiteServiceNew } from './sqlite-service';
export { DataCollector } from './collector';
export type { CollectorConfig, ProcessValues, CalculatedParams } from './collector';

export { InfluxService as default };
