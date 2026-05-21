// ============================================================
// migration-roll-forward.test.ts — SP-FX-30 (updated SP-PLC-1)
// fresh DB roll-forward 端到端验证: 001~039 全 migration 顺序执行
// ============================================================

import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { runMigrations } from '../migrator';

/** 创建 fresh in-memory DB 并执行全部 migration */
async function rollForward(): Promise<Database.Database> {
  const db = new Database(':memory:');
  const migrationsDir = join(__dirname, '../../migrations');
  await runMigrations(db, migrationsDir);
  return db;
}

describe('migration roll-forward 001~039', () => {
  it('T1: fresh DB 顺序执行全 39 migration 不抛异常', async () => {
    await expect(rollForward()).resolves.toBeDefined();
  });

  it('T2: _migrations 表记录恰好 38 条 (每个 migration 文件各一条; 006 未加入故为 38)', async () => {
    // 注: migrations 目录含 001~039 号但 006 缺失, 实际共 38 个文件
    const db = await rollForward();
    const row = db
      .prepare('SELECT count(*) AS cnt FROM _migrations')
      .get() as { cnt: number };
    expect(row.cnt).toBe(38);
  });

  it('T3: 关键业务表全部存在', async () => {
    const db = await rollForward();
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
      )
      .all()
      .map((r: any) => r.name as string);

    const required = [
      'users',          // 001 baseline
      'ai_suggestions', // 028 scada-schema
      'scada_views',    // 028 scada-schema
      'fuxa_views',     // 033
      'audit_log',      // 034 SP-FX-19
    ];
    for (const t of required) {
      expect(tables, `关键表 "${t}" 应存在`).toContain(t);
    }
  });

  it('T4: fuxa_views 包含所有预期列', async () => {
    const db = await rollForward();
    const cols = db
      .prepare('PRAGMA table_info(fuxa_views)')
      .all()
      .map((r: any) => r.name as string);

    const expected = [
      'id', 'name', 'type', 'payload', 'width', 'height',
      'parent_view_id', 'is_template', 'version',
      'created_at', 'updated_at', 'created_by', 'updated_by',
    ];
    for (const col of expected) {
      expect(cols, `fuxa_views 应包含列 "${col}"`).toContain(col);
    }
  });

  it('T5: scada_views 含 owner_id + acl 列 (migration 035 SP-FX-24)', async () => {
    const db = await rollForward();
    const cols = db
      .prepare('PRAGMA table_info(scada_views)')
      .all()
      .map((r: any) => r.name as string);

    expect(cols, 'scada_views 应含 owner_id (035 加)').toContain('owner_id');
    expect(cols, 'scada_views 应含 acl (035 加)').toContain('acl');
  });

  it('T6: scada_views 含 svgcontent 列 (migration 036 SP-FX-34 KI-3)', async () => {
    const db = await rollForward();
    const cols = db
      .prepare('PRAGMA table_info(scada_views)')
      .all()
      .map((r: any) => r.name as string);

    expect(cols, 'scada_views 应含 svgcontent (036 加)').toContain('svgcontent');
  });

  it('T7: alert_channels / alert_rules / alert_history 三张表存在 (migration 037 SP-FX-42)', async () => {
    const db = await rollForward();
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all()
      .map((r: any) => r.name as string);

    expect(tables, 'alert_channels 表应存在').toContain('alert_channels');
    expect(tables, 'alert_rules 表应存在').toContain('alert_rules');
    expect(tables, 'alert_history 表应存在').toContain('alert_history');
  });

  it('T8: phase_instances 表存在并含全部字段 (migration 038 SP-RG-4)', async () => {
    const db = await rollForward();
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all()
      .map((r: any) => r.name as string);
    expect(tables, 'phase_instances 表应存在').toContain('phase_instances');

    const cols = db
      .prepare('PRAGMA table_info(phase_instances)')
      .all()
      .map((r: any) => r.name as string);
    for (const col of ['instance_id', 'phase_class', 'reactor_id', 'label', 'params_override', 'notes', 'created_at', 'created_by']) {
      expect(cols, `phase_instances 应含列 "${col}"`).toContain(col);
    }
  });

  it('T9: plc_reactor_bindings 表存在并含全部字段 (migration 039 SP-PLC-1)', async () => {
    const db = await rollForward();
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all()
      .map((r: any) => r.name as string);
    expect(tables, 'plc_reactor_bindings 表应存在').toContain('plc_reactor_bindings');

    const cols = db
      .prepare('PRAGMA table_info(plc_reactor_bindings)')
      .all()
      .map((r: any) => r.name as string);
    for (const col of ['plc_id', 'reactor_id', 'created_at', 'created_by']) {
      expect(cols, `plc_reactor_bindings 应含列 "${col}"`).toContain(col);
    }
  });
});
