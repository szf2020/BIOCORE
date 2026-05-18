// ============================================================
// audit-log-service.test.ts — TDD RED → GREEN
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { insertAuditLog, queryAuditLog } from '../audit-log-service';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(readFileSync(join(__dirname, '../../../server/migrations/001-baseline-schema.sql'), 'utf8'));
  db.exec(readFileSync(join(__dirname, '../../../server/migrations/034-audit-log.sql'), 'utf8'));
  return db;
}

describe('insertAuditLog', () => {
  let db: Database.Database;
  beforeEach(() => { db = makeDb(); });

  it('inserts a row and can query it back', () => {
    insertAuditLog(db, {
      user_id: 'u1',
      action: 'POST',
      resource_type: 'batches',
      resource_id: '42',
      payload: '{"name":"test"}',
      ip: '127.0.0.1',
    });
    const rows = db.prepare('SELECT * FROM audit_log').all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe('u1');
    expect(rows[0].action).toBe('POST');
    expect(rows[0].resource_type).toBe('batches');
    expect(rows[0].resource_id).toBe('42');
  });
});

describe('queryAuditLog', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = makeDb();
    insertAuditLog(db, { user_id: 'alice', action: 'POST',   resource_type: 'batches', resource_id: '1', payload: null, ip: null });
    insertAuditLog(db, { user_id: 'bob',   action: 'PUT',    resource_type: 'recipes', resource_id: '2', payload: null, ip: null });
    insertAuditLog(db, { user_id: 'alice', action: 'DELETE', resource_type: 'recipes', resource_id: '3', payload: null, ip: null });
  });

  it('filters by userId', () => {
    const rows = queryAuditLog(db, { userId: 'alice', limit: 10, offset: 0 });
    expect(rows).toHaveLength(2);
    expect(rows.every((r: any) => r.user_id === 'alice')).toBe(true);
  });

  it('filters by resourceType', () => {
    const rows = queryAuditLog(db, { resourceType: 'recipes', limit: 10, offset: 0 });
    expect(rows).toHaveLength(2);
    expect(rows.every((r: any) => r.resource_type === 'recipes')).toBe(true);
  });

  it('respects limit and offset for pagination', () => {
    const page1 = queryAuditLog(db, { limit: 2, offset: 0 });
    const page2 = queryAuditLog(db, { limit: 2, offset: 2 });
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(1);
  });
});
