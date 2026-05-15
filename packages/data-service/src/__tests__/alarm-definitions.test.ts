import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SQLiteService } from '../sqlite-service';

function makeDb(): { db: Database.Database; svc: SQLiteService } {
  const db = new Database(':memory:');
  db.exec(readFileSync(join(__dirname, '../../../server/migrations/001-baseline-schema.sql'), 'utf8'));
  db.exec(readFileSync(join(__dirname, '../../../server/migrations/027-alarm-definitions.sql'), 'utf8'));
  const svc = new SQLiteService(db);
  return { db, svc };
}

describe('SQLiteService alarm definitions CRUD', () => {
  let svc: SQLiteService;
  let db: Database.Database;
  beforeEach(() => { ({ db, svc } = makeDb()); });

  it('createAlarmDefinition inserts and returns id with defaults', () => {
    const id = svc.createAlarmDefinition({
      code: 'TEMP_HI', name: '温度过高', severity: 'warning',
      message_template: '反应器 {channel} 温度 {pv} 超出 {threshold}',
      channel: 'F01.TEMP', threshold_high: 40.0,
    });
    expect(id).toBeGreaterThan(0);
    const row = svc.getAlarmDefinition(id);
    expect(row.code).toBe('TEMP_HI');
    expect(row.enabled).toBe(1);
    expect(row.ack_required).toBe(1);
    expect(row.owner).toBeNull();
    expect(row.threshold_high).toBe(40.0);
    expect(row.threshold_low).toBeNull();
    expect(row.created_at).toBeTruthy();
  });

  it('listAlarmDefinitions filters by owner / severity / enabled', () => {
    svc.createAlarmDefinition({ code: 'A', name: 'a', severity: 'info', message_template: 'm', owner: 'F01' });
    svc.createAlarmDefinition({ code: 'B', name: 'b', severity: 'critical', message_template: 'm', owner: 'F01' });
    svc.createAlarmDefinition({ code: 'C', name: 'c', severity: 'info', message_template: 'm', owner: null });
    svc.createAlarmDefinition({ code: 'D', name: 'd', severity: 'info', message_template: 'm', enabled: false });

    expect(svc.listAlarmDefinitions({ owner: 'F01' }).length).toBe(2);
    expect(svc.listAlarmDefinitions({ owner: '' }).length).toBe(2); // owner IS NULL → 2 (C + D)
    expect(svc.listAlarmDefinitions({ severity: 'critical' }).length).toBe(1);
    expect(svc.listAlarmDefinitions({ enabled: true }).length).toBe(3);
    expect(svc.listAlarmDefinitions({ enabled: false }).length).toBe(1);
    expect(svc.listAlarmDefinitions({ owner: 'F01', severity: 'info' }).length).toBe(1);
  });

  it('updateAlarmDefinition patches partial fields and bumps updated_at', () => {
    const id = svc.createAlarmDefinition({ code: 'X', name: 'orig', severity: 'info', message_template: 'm' });
    const before = svc.getAlarmDefinition(id);

    expect(svc.updateAlarmDefinition(id, { name: 'new name', enabled: false, threshold_high: 99 })).toBe(true);
    const after = svc.getAlarmDefinition(id);
    expect(after.name).toBe('new name');
    expect(after.enabled).toBe(0);
    expect(after.threshold_high).toBe(99);
    expect(after.severity).toBe('info');  // not patched
    expect(after.code).toBe('X');         // not patched
    expect(after.updated_at >= before.updated_at).toBe(true);
  });

  it('updateAlarmDefinition rejects unknown columns + empty patch returns false', () => {
    const id = svc.createAlarmDefinition({ code: 'Y', name: 'y', severity: 'info', message_template: 'm' });
    expect(svc.updateAlarmDefinition(id, {})).toBe(false);
    expect(svc.updateAlarmDefinition(id, { evil: 'DROP TABLE' } as any)).toBe(false);
    const row = svc.getAlarmDefinition(id);
    expect(row.code).toBe('Y');
  });

  it('deleteAlarmDefinition removes row; nonexistent returns false', () => {
    const id = svc.createAlarmDefinition({ code: 'Z', name: 'z', severity: 'info', message_template: 'm' });
    expect(svc.deleteAlarmDefinition(id)).toBe(true);
    expect(svc.getAlarmDefinition(id)).toBeNull();
    expect(svc.deleteAlarmDefinition(99999)).toBe(false);
  });

  it('severity CHECK constraint rejects unknown values', () => {
    expect(() => svc.createAlarmDefinition({
      code: 'BAD', name: 'b', severity: 'fatal' as any, message_template: 'm',
    })).toThrow();
  });

  it('UNIQUE code constraint rejects duplicates', () => {
    svc.createAlarmDefinition({ code: 'DUP', name: 'a', severity: 'info', message_template: 'm' });
    expect(() => svc.createAlarmDefinition({
      code: 'DUP', name: 'b', severity: 'info', message_template: 'm',
    })).toThrow();
  });
});
