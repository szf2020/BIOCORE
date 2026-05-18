// ============================================================
// audit-log-middleware.test.ts — TDD RED → GREEN (SP-FX-19)
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAuditLogMiddleware } from '../middlewares/audit-log';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(readFileSync(join(__dirname, '../../migrations/001-baseline-schema.sql'), 'utf8'));
  db.exec(readFileSync(join(__dirname, '../../migrations/034-audit-log.sql'), 'utf8'));
  return db;
}

function makeReq(overrides: Record<string, any> = {}) {
  return {
    method: 'GET',
    path: '/api/v1/batches',
    ip: '127.0.0.1',
    body: {},
    user: { sub: 'user1', role: 'admin' },
    ...overrides,
  } as any;
}

function makeRes() {
  return {} as any;
}

describe('createAuditLogMiddleware', () => {
  let db: Database.Database;
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    db = makeDb();
    next = vi.fn();
  });

  it('GET 请求不写 audit 行', () => {
    const mw = createAuditLogMiddleware(db);
    mw(makeReq({ method: 'GET' }), makeRes(), next);
    const rows = db.prepare('SELECT * FROM audit_log').all();
    expect(rows).toHaveLength(0);
    expect(next).toHaveBeenCalled();
  });

  it('POST 请求写 audit 行', () => {
    const mw = createAuditLogMiddleware(db);
    mw(makeReq({ method: 'POST', path: '/api/v1/batches/42' }), makeRes(), next);
    const rows = db.prepare('SELECT * FROM audit_log').all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('POST');
    expect(rows[0].resource_type).toBe('batches');
    expect(rows[0].resource_id).toBe('42');
    expect(rows[0].user_id).toBe('user1');
    expect(next).toHaveBeenCalled();
  });

  it('健康检查路径跳过', () => {
    const mw = createAuditLogMiddleware(db);
    mw(makeReq({ method: 'POST', path: '/api/v1/admin/health/liveness' }), makeRes(), next);
    const rows = db.prepare('SELECT * FROM audit_log').all();
    expect(rows).toHaveLength(0);
    expect(next).toHaveBeenCalled();
  });

  it('body 超 4096 字节时截断 payload', () => {
    const mw = createAuditLogMiddleware(db);
    const bigBody = { data: 'x'.repeat(5000) };
    mw(makeReq({ method: 'POST', path: '/api/v1/recipes', body: bigBody }), makeRes(), next);
    const rows = db.prepare('SELECT * FROM audit_log').all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.length).toBeLessThanOrEqual(4096);
  });

  it('DB 写失败时不影响 next() 调用', () => {
    // 使用已关闭的 db 模拟写失败
    const badDb = makeDb();
    badDb.close();
    const mw = createAuditLogMiddleware(badDb);
    expect(() => mw(makeReq({ method: 'DELETE', path: '/api/v1/views/9' }), makeRes(), next)).not.toThrow();
    expect(next).toHaveBeenCalled();
  });
});
