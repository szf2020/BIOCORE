/**
 * v1.9.0 P2 bucket 3 — AuditQueue unit tests.
 *
 * Hermetic: each test uses an in-memory-ish SQLiteService backed by a
 * temp file that is unlinked after the suite. We do NOT import index.ts
 * (that would bind ports + open the real DB). Instead we construct
 * SQLiteService directly against a temp path and manually create the
 * audit_logs table so writeAuditLog() works without running the full
 * Umzug migration chain.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';
import Database from 'better-sqlite3';
import { SQLiteService } from '@biocore/data-service';
import { AuditQueue, initAuditQueue, getAuditQueue, _resetAuditQueueForTest } from '../audit-queue';

// ─── helpers ────────────────────────────────────────────────────────────────

const tmpPaths: string[] = [];

function makeTempSqlite(): { sqlite: SQLiteService; dbPath: string; rawDb: Database.Database } {
  const dbPath = join(tmpdir(), `audit-queue-test-${randomBytes(6).toString('hex')}.db`);
  tmpPaths.push(dbPath);
  const sqlite = new SQLiteService(dbPath);
  const rawDb = sqlite.getDatabase();
  // Create minimal audit_logs table matching production schema
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id    TEXT,
      user_id     TEXT NOT NULL,
      action      TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id   TEXT,
      old_value   TEXT,
      new_value   TEXT,
      reason      TEXT,
      ip_address  TEXT,
      trace_id    TEXT,
      target_kind TEXT,
      timestamp   TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return { sqlite, dbPath, rawDb };
}

function auditCount(rawDb: Database.Database): number {
  return (rawDb.prepare('SELECT COUNT(*) as c FROM audit_logs').get() as { c: number }).c;
}

// ─── setup / teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  _resetAuditQueueForTest();
});

afterEach(() => {
  _resetAuditQueueForTest();
  // Clean up temp DB files
  for (const p of tmpPaths.splice(0)) {
    try { if (existsSync(p)) unlinkSync(p); } catch { /* best effort */ }
    try { if (existsSync(p + '-wal')) unlinkSync(p + '-wal'); } catch { /* best effort */ }
    try { if (existsSync(p + '-shm')) unlinkSync(p + '-shm'); } catch { /* best effort */ }
  }
});

// ─── tests ──────────────────────────────────────────────────────────────────

describe('AuditQueue — enqueue + setImmediate drain', () => {
  it('enqueue → setImmediate drain writes a row to the DB', async () => {
    const { sqlite, rawDb } = makeTempSqlite();
    const queue = new AuditQueue(sqlite);

    queue.enqueue({ user_id: 'sys', action: 'test_action', target_type: 'test' });
    expect(auditCount(rawDb)).toBe(0); // not written yet — still in queue

    // Let setImmediate fire
    await new Promise<void>(r => setImmediate(r));

    expect(auditCount(rawDb)).toBe(1);
    expect(queue.stats.drained).toBe(1);
    expect(queue.stats.enqueued).toBe(1);
  });

  it('multiple enqueues in the same tick coalesce into a single drain', async () => {
    const { sqlite, rawDb } = makeTempSqlite();
    const queue = new AuditQueue(sqlite);

    for (let i = 0; i < 5; i++) {
      queue.enqueue({ user_id: 'sys', action: `action_${i}`, target_type: 'test' });
    }
    expect(auditCount(rawDb)).toBe(0); // none written yet

    await new Promise<void>(r => setImmediate(r));

    expect(auditCount(rawDb)).toBe(5);
    expect(queue.stats.drained).toBe(5);
    expect(queue.stats.enqueued).toBe(5);
    // Only one drain should have been scheduled (drainScheduled coalescing)
    expect(queue.depth()).toBe(0);
  });

  it('depth() reflects current queue size before drain fires', () => {
    const { sqlite } = makeTempSqlite();
    const queue = new AuditQueue(sqlite);

    expect(queue.depth()).toBe(0);
    queue.enqueue({ user_id: 'sys', action: 'a', target_type: 't' });
    queue.enqueue({ user_id: 'sys', action: 'b', target_type: 't' });
    expect(queue.depth()).toBe(2);
  });
});

describe('AuditQueue — flushSync', () => {
  it('drains synchronously without waiting for setImmediate', () => {
    const { sqlite, rawDb } = makeTempSqlite();
    const queue = new AuditQueue(sqlite);

    queue.enqueue({ user_id: 'sys', action: 'a1', target_type: 'test' });
    queue.enqueue({ user_id: 'sys', action: 'a2', target_type: 'test' });
    queue.enqueue({ user_id: 'sys', action: 'a3', target_type: 'test' });

    // Still 0 — setImmediate hasn't fired
    expect(auditCount(rawDb)).toBe(0);

    const flushed = queue.flushSync();
    expect(flushed).toBe(3);
    // Immediately after flushSync, rows must be in DB
    expect(auditCount(rawDb)).toBe(3);
    expect(queue.depth()).toBe(0);
  });

  it('flushSync returns 0 and is a no-op when queue is empty', () => {
    const { sqlite, rawDb } = makeTempSqlite();
    const queue = new AuditQueue(sqlite);

    expect(queue.flushSync()).toBe(0);
    expect(auditCount(rawDb)).toBe(0);
  });
});

describe('AuditQueue — drain failure handling', () => {
  it('drain failure increments dropped counter and logs an error', async () => {
    const { sqlite } = makeTempSqlite();
    const queue = new AuditQueue(sqlite);

    // Sabotage writeAuditLog so the transaction throws
    const origWrite = sqlite.writeAuditLog.bind(sqlite);
    sqlite.writeAuditLog = () => { throw new Error('simulated DB contention'); };

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    queue.enqueue({ user_id: 'sys', action: 'doomed', target_type: 'test' });
    queue.enqueue({ user_id: 'sys', action: 'doomed2', target_type: 'test' });

    await new Promise<void>(r => setImmediate(r));

    expect(queue.stats.dropped).toBe(2);
    expect(queue.stats.drained).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AUDIT] queue drain failed'),
      expect.any(String),
    );

    consoleSpy.mockRestore();
    sqlite.writeAuditLog = origWrite;
  });
});

describe('AuditQueue — module-level init/get helpers', () => {
  it('initAuditQueue + getAuditQueue returns the same instance', () => {
    const { sqlite } = makeTempSqlite();
    const q1 = initAuditQueue(sqlite);
    const q2 = getAuditQueue();
    expect(q1).toBe(q2);
  });

  it('initAuditQueue throws if called twice without reset', () => {
    const { sqlite } = makeTempSqlite();
    const { sqlite: sqlite2 } = makeTempSqlite();
    initAuditQueue(sqlite);
    expect(() => initAuditQueue(sqlite2)).toThrow('audit queue already initialized');
  });

  it('getAuditQueue throws if called before initAuditQueue', () => {
    // _resetAuditQueueForTest() runs in beforeEach so singleton is null
    expect(() => getAuditQueue()).toThrow('audit queue not initialized');
  });
});
