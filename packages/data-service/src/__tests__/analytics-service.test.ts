// ============================================================
// analytics-service.test.ts — TDD RED → GREEN (SP-FX-43)
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  queryViewUsage,
  queryWidgetTypes,
  queryUserActivity,
  queryWriteIntentStats,
  parseRangeToDays,
} from '../analytics-service';

const MIGRATIONS_DIR = join(__dirname, '../../../server/migrations');

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(readFileSync(join(MIGRATIONS_DIR, '001-baseline-schema.sql'), 'utf8'));
  db.exec(readFileSync(join(MIGRATIONS_DIR, '028-scada-schema.sql'), 'utf8'));
  db.exec(readFileSync(join(MIGRATIONS_DIR, '033-fuxa-views.sql'), 'utf8'));
  db.exec(readFileSync(join(MIGRATIONS_DIR, '034-audit-log.sql'), 'utf8'));
  return db;
}

function insertAuditRow(db: Database.Database, opts: {
  user_id?: string; resource_type: string; resource_id?: string;
  action?: string; timestamp?: string;
}): void {
  db.prepare(`
    INSERT INTO audit_log (user_id, action, resource_type, resource_id, payload, ip, timestamp)
    VALUES (@user_id, @action, @resource_type, @resource_id, NULL, NULL, @timestamp)
  `).run({
    user_id: opts.user_id ?? 'u1',
    action: opts.action ?? 'GET',
    resource_type: opts.resource_type,
    resource_id: opts.resource_id ?? null,
    timestamp: opts.timestamp ?? new Date().toISOString(),
  });
}

function insertSuggestion(db: Database.Database, opts: {
  status: string; reasoning?: string; created_at?: string;
}): void {
  db.prepare('PRAGMA foreign_keys = OFF').run();
  db.prepare(`
    INSERT INTO ai_suggestions
      (batch_id, suggestion_type, source_module, target_param, status, reasoning, created_at)
    VALUES ('b1', 'param', 'test', 'temperature', @status, @reasoning, @created_at)
  `).run({
    status: opts.status,
    reasoning: opts.reasoning ?? null,
    created_at: opts.created_at ?? new Date().toISOString(),
  });
  db.prepare('PRAGMA foreign_keys = ON').run();
}

// ── parseRangeToDays ────────────────────────────────────────

describe('parseRangeToDays', () => {
  it('7d → -7 days', () => {
    expect(parseRangeToDays('7d')).toBe('-7 days');
  });

  it('30d → -30 days', () => {
    expect(parseRangeToDays('30d')).toBe('-30 days');
  });

  it('90d → -90 days', () => {
    expect(parseRangeToDays('90d')).toBe('-90 days');
  });

  it('unknown → -7 days (default)', () => {
    expect(parseRangeToDays('invalid')).toBe('-7 days');
  });
});

// ── queryViewUsage ──────────────────────────────────────────

describe('queryViewUsage', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    insertAuditRow(db, { resource_type: 'scada', resource_id: 'v1' });
    insertAuditRow(db, { resource_type: 'scada', resource_id: 'v1' });
    insertAuditRow(db, { resource_type: 'scada', resource_id: 'v2' });
    insertAuditRow(db, { resource_type: 'views', resource_id: 'v3' });
    // 超出范围的旧记录
    insertAuditRow(db, {
      resource_type: 'scada', resource_id: 'old',
      timestamp: '2020-01-01T00:00:00',
    });
  });

  it('返回 view 访问排名 (desc)', () => {
    const result = queryViewUsage(db, '-7 days');
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].view_id).toBe('v1');
    expect(result[0].access_count).toBe(2);
  });

  it('同时统计 scada + views 两种 resource_type', () => {
    const result = queryViewUsage(db, '-7 days');
    const ids = result.map(r => r.view_id);
    expect(ids).toContain('v3');
  });

  it('超出范围的旧记录不计入', () => {
    const result = queryViewUsage(db, '-7 days');
    const ids = result.map(r => r.view_id);
    expect(ids).not.toContain('old');
  });
});

// ── queryWidgetTypes ────────────────────────────────────────

describe('queryWidgetTypes', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    db.prepare(`INSERT INTO scada_projects (project_id, name) VALUES ('p1', 'Test')`).run();
    db.prepare(`
      INSERT INTO scada_views (view_id, project_id, name, items_json, updated_at)
      VALUES ('sv1', 'p1', 'View1',
        '{"w1":{"type":"gauge"},"w2":{"type":"label"},"w3":{"type":"gauge"}}',
        datetime('now'))
    `).run();
    db.prepare(`
      INSERT INTO fuxa_views (id, name, type, payload, width, height, updated_at)
      VALUES ('fv1', 'FuxaView', 'svg',
        '{"items":[{"type":"button"},{"type":"gauge"}]}',
        800, 600, datetime('now'))
    `).run();
  });

  it('聚合 scada_views + fuxa_views 的 widget type 频次', () => {
    const result = queryWidgetTypes(db, '-30 days');
    const gaugeEntry = result.find(r => r.type === 'gauge');
    expect(gaugeEntry).toBeDefined();
    expect(gaugeEntry!.count).toBeGreaterThanOrEqual(3); // 2 from scada + 1 from fuxa
  });

  it('结果按 count desc 排序', () => {
    const result = queryWidgetTypes(db, '-30 days');
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].count).toBeGreaterThanOrEqual(result[i].count);
    }
  });
});

// ── queryUserActivity ───────────────────────────────────────

describe('queryUserActivity', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    const today = new Date().toISOString().slice(0, 10);
    insertAuditRow(db, { user_id: 'alice', resource_type: 'batches', timestamp: `${today}T09:00:00` });
    insertAuditRow(db, { user_id: 'bob',   resource_type: 'batches', timestamp: `${today}T10:00:00` });
    insertAuditRow(db, { user_id: 'alice', resource_type: 'batches', timestamp: `${today}T11:00:00` });
    // 超出范围
    insertAuditRow(db, { user_id: 'charlie', resource_type: 'batches', timestamp: '2020-01-01T00:00:00' });
  });

  it('DAU 正确计算 (user_id 去重)', () => {
    const result = queryUserActivity(db, '-7 days');
    expect(result.dau.length).toBeGreaterThanOrEqual(1);
    const todayDau = result.dau.at(-1);
    expect(todayDau?.dau).toBe(2); // alice + bob
  });

  it('超出范围的记录对应 day 不出现', () => {
    const result = queryUserActivity(db, '-7 days');
    expect(result.dau.some(d => d.day === '2020-01-01')).toBe(false);
  });

  it('返回结构含 dau + wau 数组', () => {
    const result = queryUserActivity(db, '-7 days');
    expect(Array.isArray(result.dau)).toBe(true);
    expect(Array.isArray(result.wau)).toBe(true);
  });
});

// ── queryWriteIntentStats ───────────────────────────────────

describe('queryWriteIntentStats', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    insertSuggestion(db, { status: 'accepted' });
    insertSuggestion(db, { status: 'accepted' });
    insertSuggestion(db, { status: 'rejected', reasoning: '参数超限' });
    insertSuggestion(db, { status: 'rejected', reasoning: '参数超限' });
    insertSuggestion(db, { status: 'rejected', reasoning: '安全连锁激活' });
    insertSuggestion(db, { status: 'pending' }); // 不应计入
  });

  it('正确统计 accept + reject 数量', () => {
    const result = queryWriteIntentStats(db, '-7 days');
    expect(result.accept_count).toBe(2);
    expect(result.reject_count).toBe(3);
  });

  it('accept_rate 计算正确', () => {
    const result = queryWriteIntentStats(db, '-7 days');
    expect(result.accept_rate).toBeCloseTo(2 / 5, 3);
  });

  it('reject_reasons 按 count desc 排序', () => {
    const result = queryWriteIntentStats(db, '-7 days');
    expect(result.reject_reasons.length).toBeGreaterThanOrEqual(1);
    expect(result.reject_reasons[0].reason).toBe('参数超限');
    expect(result.reject_reasons[0].count).toBe(2);
  });

  it('pending 状态不计入统计', () => {
    const result = queryWriteIntentStats(db, '-7 days');
    expect(result.accept_count + result.reject_count).toBe(5);
  });
});
