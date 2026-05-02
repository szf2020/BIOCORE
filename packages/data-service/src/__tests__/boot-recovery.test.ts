// ============================================================
// v1.7.2 — Boot-time crash-recovery helpers regression test.
//
// Verifies getOrphanBatches() returns batches with non-terminal
// state, and markBatchHeldForRecovery() correctly transitions
// them to 'held' with the supplied reason.
//
// Uses an in-memory SQLite DB with a minimal schema so the test
// is independent of the migration runner / production schema
// (which has issues in this test harness — see existing
// data-service.test.ts pre-existing failures).
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { getOrphanBatches, markBatchHeldForRecovery, markBatchAborted } from '../sqlite-service';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE batches (
      batch_id TEXT PRIMARY KEY,
      recipe_id TEXT NOT NULL,
      recipe_version TEXT NOT NULL,
      reactor_id TEXT NOT NULL,
      current_state TEXT NOT NULL,
      hold_reason TEXT,
      stop_trigger TEXT,
      notes TEXT,
      current_node_id TEXT,
      current_phase_index INTEGER,
      current_loop_frames TEXT,
      started_at TEXT
    );
  `);
  return db;
}

describe('v1.7.2 boot-recovery helpers', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
  });

  it('getOrphanBatches returns batches in running/held/paused, not terminal states', () => {
    const insert = db.prepare(`
      INSERT INTO batches (batch_id, recipe_id, recipe_version, reactor_id,
                           current_state, current_node_id, current_phase_index, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run('B-RUN-1',  'R1', '1.0.0', 'F01', 'running',  'n_2', 2, '2026-05-01T10:00:00Z');
    insert.run('B-HELD-1', 'R1', '1.0.0', 'F02', 'held',     'n_1', 1, '2026-05-01T11:00:00Z');
    insert.run('B-PAUS-1', 'R1', '1.0.0', 'F03', 'paused',   'n_0', 0, '2026-05-01T12:00:00Z');
    insert.run('B-IDLE',   'R1', '1.0.0', 'F04', 'idle',      null, null, '2026-05-01T08:00:00Z');
    insert.run('B-DONE',   'R1', '1.0.0', 'F05', 'complete',  null, null, '2026-05-01T07:00:00Z');
    insert.run('B-STOP',   'R1', '1.0.0', 'F06', 'stopped',   null, null, '2026-05-01T06:00:00Z');

    const orphans = getOrphanBatches(db);

    expect(orphans).toHaveLength(3);
    const ids = orphans.map(o => o.batch_id).sort();
    expect(ids).toEqual(['B-HELD-1', 'B-PAUS-1', 'B-RUN-1']);
    // Each row carries the metadata the recovery scanner needs
    const run = orphans.find(o => o.batch_id === 'B-RUN-1')!;
    expect(run.current_state).toBe('running');
    expect(run.current_node_id).toBe('n_2');
    expect(run.recipe_id).toBe('R1');
    expect(run.reactor_id).toBe('F01');
  });

  it('markBatchHeldForRecovery sets state=held and writes the reason', () => {
    db.prepare(`
      INSERT INTO batches (batch_id, recipe_id, recipe_version, reactor_id,
                           current_state, current_node_id, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('B-1', 'R1', '1.0.0', 'F01', 'running', 'n_3', '2026-05-01T10:00:00Z');

    const reason = 'server_restart_recovery@2026-05-02T00:00:00Z';
    markBatchHeldForRecovery(db, 'B-1', reason);

    const after = db.prepare('SELECT current_state, hold_reason FROM batches WHERE batch_id = ?').get('B-1') as any;
    expect(after.current_state).toBe('held');
    expect(after.hold_reason).toBe(reason);
  });

  it('markBatchHeldForRecovery is a no-op for non-existent batch_id (no exception)', () => {
    expect(() => markBatchHeldForRecovery(db, 'B-DOESNT-EXIST', 'reason')).not.toThrow();
  });

  it('markBatchAborted (v1.9.0 P2 bucket 2) sets stopped/cmd_stop and appends notes', () => {
    db.prepare(`
      INSERT INTO batches (batch_id, recipe_id, recipe_version, reactor_id,
                           current_state, current_node_id, started_at, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('B-A1', 'R1', '1.0.0', 'F01', 'running', 'n_0', '2026-05-01T10:00:00Z', 'pre-existing note');

    markBatchAborted(db, 'B-A1', 'policy=abort/long_outage');

    const after = db.prepare('SELECT * FROM batches WHERE batch_id = ?').get('B-A1') as any;
    expect(after.current_state).toBe('stopped');
    expect(after.stop_trigger).toBe('cmd_stop');
    // notes is APPENDED, not overwritten — pre-existing note must survive
    expect(after.notes).toContain('pre-existing note');
    expect(after.notes).toContain('recovery_abort: policy=abort/long_outage');
  });

  it('markBatchAborted handles batches with NULL notes (COALESCE path)', () => {
    db.prepare(`
      INSERT INTO batches (batch_id, recipe_id, recipe_version, reactor_id,
                           current_state, started_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('B-A2', 'R1', '1.0.0', 'F01', 'running', '2026-05-01T10:00:00Z');

    markBatchAborted(db, 'B-A2', 'no_prior_notes');

    const after = db.prepare('SELECT * FROM batches WHERE batch_id = ?').get('B-A2') as any;
    expect(after.current_state).toBe('stopped');
    expect(after.stop_trigger).toBe('cmd_stop');
    expect(after.notes).toContain('recovery_abort: no_prior_notes');
  });

  it('full recovery scan + mark loop preserves current_node_id and other metadata', () => {
    // Simulate a real recovery: scan running, mark each as held, verify metadata intact
    const insert = db.prepare(`
      INSERT INTO batches (batch_id, recipe_id, recipe_version, reactor_id,
                           current_state, current_node_id, current_phase_index, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run('B-OUTAGE', 'RX', '2.1.0', 'F01', 'running', 'n_5', 5, '2026-05-01T08:00:00Z');

    const orphans = getOrphanBatches(db);
    expect(orphans).toHaveLength(1);

    for (const o of orphans) {
      markBatchHeldForRecovery(db, o.batch_id, 'recovery@boot');
    }

    const after = db.prepare('SELECT * FROM batches WHERE batch_id = ?').get('B-OUTAGE') as any;
    // State now held + reason
    expect(after.current_state).toBe('held');
    expect(after.hold_reason).toBe('recovery@boot');
    // current_node_id preserved → caller can later resumeBatch() with it
    expect(after.current_node_id).toBe('n_5');
    expect(after.current_phase_index).toBe(5);
    expect(after.recipe_id).toBe('RX');
    expect(after.recipe_version).toBe('2.1.0');
  });
});
