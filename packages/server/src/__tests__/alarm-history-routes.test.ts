import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import { SQLiteService } from '@biocore/data-service';

let app: express.Express;
let svc: SQLiteService;
let db: Database.Database;

beforeAll(() => {
  db = new Database(':memory:');
  db.exec(readFileSync(join(__dirname, '../../migrations/001-baseline-schema.sql'), 'utf8'));
  db.prepare(
    `INSERT INTO recipes (recipe_id, version, name, author, vessel_config, phases, created_by)
     VALUES ('R1', '1.0.0', 'Test', 't', '{}', '[]', 't')`
  ).run();
  db.prepare(
    `INSERT INTO batches (batch_id, recipe_id, recipe_version, reactor_id, operator_id, total_phases)
     VALUES ('b1', 'R1', '1.0.0', 'F01', 'op1', 1), ('b2', 'R1', '1.0.0', 'F02', 'op1', 1)`
  ).run();
  svc = new SQLiteService(db);

  svc.createAlarm({ batch_id: 'b1', alarm_code: 'TEMP_HI', severity: 'warning', message: 'temp high', source: 'plc', channel: 'F01.TEMP' });
  svc.createAlarm({ batch_id: 'b1', alarm_code: 'PH_LOW', severity: 'critical', message: 'pH low', source: 'plc', channel: 'F01.PH' });
  svc.createAlarm({ batch_id: 'b2', alarm_code: 'CUSUM_DRIFT', severity: 'info', message: 'drift', source: 'cusum_anomaly', channel: 'F02.PH' });
  svc.createAlarm({ batch_id: 'b2', alarm_code: 'ANOM_X', severity: 'warning', message: 'ai anom', source: 'ai:detector', channel: 'F02.DO' });
  const all: any[] = db.prepare('SELECT id FROM alarms ORDER BY id').all();
  svc.acknowledgeAlarm(all[0].id, 'op1');

  app = express();
  app.use(express.json());

  app.get('/alarms/history', (req, res) => {
    const q = req.query;
    const filter = {
      batch_id: (q.batch_id as string) || undefined,
      reactor_id: (q.reactor_id as string) || undefined,
      severity: (q.severity as string) || undefined,
      ack: (q.ack as 'all' | 'ack' | 'unack') || 'all',
      since: (q.since as string) || undefined,
      until: (q.until as string) || undefined,
      category: (q.category as 'all' | 'cusum' | 'operational') || 'operational',
      limit: q.limit ? parseInt(q.limit as string) : 500,
      offset: q.offset ? parseInt(q.offset as string) : 0,
    };
    res.json({ items: svc.listAlarmHistory(filter), total: svc.countAlarmHistory(filter), limit: filter.limit, offset: filter.offset });
  });
  app.get('/cusum/history', (req, res) => {
    const q = req.query;
    const filter = {
      batch_id: (q.batch_id as string) || undefined,
      reactor_id: (q.reactor_id as string) || undefined,
      severity: (q.severity as string) || undefined,
      ack: (q.ack as 'all' | 'ack' | 'unack') || 'all',
      since: (q.since as string) || undefined,
      until: (q.until as string) || undefined,
      category: 'cusum' as const,
      limit: q.limit ? parseInt(q.limit as string) : 500,
      offset: q.offset ? parseInt(q.offset as string) : 0,
    };
    res.json({ items: svc.listAlarmHistory(filter), total: svc.countAlarmHistory(filter), limit: filter.limit, offset: filter.offset });
  });
});

describe('GET /alarms/history (operational by default)', () => {
  it('default returns only operational rows (excludes cusum_anomaly + ai: + CUSUM_*)', async () => {
    const r = await request(app).get('/alarms/history');
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(2);
    expect(r.body.items.every((it: any) => !['cusum_anomaly'].includes(it.source) && !String(it.source).startsWith('ai:'))).toBe(true);
  });

  it('filters by severity', async () => {
    const r = await request(app).get('/alarms/history?severity=critical');
    expect(r.body.total).toBe(1);
    expect(r.body.items[0].severity).toBe('critical');
  });

  it('filters by reactor_id (via batches JOIN)', async () => {
    const r = await request(app).get('/alarms/history?reactor_id=F01');
    expect(r.body.total).toBe(2);
    expect(r.body.items.every((it: any) => it.reactor_id === 'F01')).toBe(true);
  });

  it('filters by ack=unack', async () => {
    const r = await request(app).get('/alarms/history?ack=unack');
    expect(r.body.total).toBe(1);
    expect(r.body.items[0].acknowledged_at).toBeNull();
  });

  it('category=all includes CUSUM + operational', async () => {
    const r = await request(app).get('/alarms/history?category=all');
    expect(r.body.total).toBe(4);
  });
});

describe('GET /cusum/history', () => {
  it('returns only cusum-class alarms (source=cusum_anomaly OR ai:* OR alarm_code=CUSUM_*)', async () => {
    const r = await request(app).get('/cusum/history');
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(2);
    expect(r.body.items.every((it: any) => it.source === 'cusum_anomaly' || String(it.source).startsWith('ai:') || String(it.alarm_code).startsWith('CUSUM_'))).toBe(true);
  });
});
