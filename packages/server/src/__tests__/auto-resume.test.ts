/**
 * v1.12.0 F2-AUTO — boot-scan auto_resume branch tests.
 *
 * Hermetic: spins up a temp-file SQLiteService with the minimal set of tables
 * the orphan-recovery scan touches (batches, audit_logs, recipes, reactor_configs).
 * Stubs the reactor-runtime hooks so we can assert resumeAndStart was called
 * without actually wiring an XState engine.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';
import Database from 'better-sqlite3';
import { SQLiteService } from '@biocore/data-service';
import {
  ReactorManager,
  type BatchControllerConfig,
  type RecoveryPolicy,
} from '@biocore/batch-engine';

import { runOrphanRecoveryScan, pickRecoveryPolicyFromEnv } from '../startup';

// ─── helpers ────────────────────────────────────────────────────────────────

const tmpPaths: string[] = [];

function makeTempSqlite(): { sqlite: SQLiteService; rawDb: Database.Database } {
  const dbPath = join(tmpdir(), `auto-resume-test-${randomBytes(6).toString('hex')}.db`);
  tmpPaths.push(dbPath);
  const sqlite = new SQLiteService(dbPath);
  const rawDb = sqlite.getDatabase();

  // Minimal schema for the boot-recovery scan
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
    CREATE TABLE IF NOT EXISTS batches (
      batch_id            TEXT PRIMARY KEY,
      recipe_id           TEXT NOT NULL,
      recipe_version      TEXT NOT NULL,
      reactor_id          TEXT NOT NULL,
      operator_id         TEXT,
      current_state       TEXT NOT NULL,
      current_phase_index INTEGER,
      current_node_id     TEXT,
      current_loop_frames TEXT,
      hold_reason         TEXT,
      stop_trigger        TEXT,
      notes               TEXT,
      started_at          TEXT,
      total_phases        INTEGER
    );
    CREATE TABLE IF NOT EXISTS recipes (
      recipe_id           TEXT NOT NULL,
      version             TEXT NOT NULL,
      name                TEXT,
      author              TEXT,
      target_organism     TEXT,
      vessel_config       TEXT,
      phases              TEXT,
      metadata            TEXT,
      status              TEXT,
      created_at          TEXT,
      created_by          TEXT,
      dag_schema_version  INTEGER DEFAULT 1,
      is_template         INTEGER DEFAULT 0,
      parent_template_id  TEXT,
      parent_version      TEXT,
      rejection_reason    TEXT,
      PRIMARY KEY (recipe_id, version)
    );
    CREATE TABLE IF NOT EXISTS reactor_configs (
      reactor_id        TEXT PRIMARY KEY,
      name              TEXT,
      description       TEXT,
      vessel_volume_L   REAL,
      plc_connection_id TEXT,
      plc_protocol      TEXT,
      plc_ip            TEXT,
      plc_port          INTEGER,
      plc_rack          INTEGER,
      plc_slot          INTEGER,
      heartbeat_write   TEXT,
      heartbeat_read    TEXT,
      enabled           INTEGER DEFAULT 1,
      sort_order        INTEGER DEFAULT 0,
      category          TEXT,
      updated_at        TEXT
    );
  `);

  return { sqlite, rawDb };
}

function insertOrphanBatch(rawDb: Database.Database, opts: {
  batchId?: string;
  recipeId?: string;
  recipeVersion?: string;
  reactorId?: string;
  prevState?: string;
  currentNodeId?: string | null;
  startedSecondsAgo?: number;
} = {}) {
  const batchId = opts.batchId ?? 'B-AR-1';
  const recipeId = opts.recipeId ?? 'R-AR';
  const recipeVersion = opts.recipeVersion ?? '1.0.0';
  const reactorId = opts.reactorId ?? 'F01';
  const prevState = opts.prevState ?? 'running';
  const nodeId = opts.currentNodeId === undefined ? 'n_0' : opts.currentNodeId;
  const ago = opts.startedSecondsAgo ?? 5;
  rawDb.prepare(`
    INSERT INTO batches (batch_id, recipe_id, recipe_version, reactor_id, operator_id,
      current_state, current_phase_index, current_node_id, started_at, total_phases)
    VALUES (?, ?, ?, ?, 'admin-001', ?, 0, ?, datetime('now', '-' || ? || ' seconds'), 1)
  `).run(batchId, recipeId, recipeVersion, reactorId, prevState, nodeId, ago);
}

function insertRecipe(rawDb: Database.Database, recipeId = 'R-AR', version = '1.0.0') {
  const phases = JSON.stringify([
    { phase_id: 'P0', type: 'fermentation', params: {} },
  ]);
  rawDb.prepare(`
    INSERT INTO recipes (recipe_id, version, name, author, target_organism,
      vessel_config, phases, metadata, status, dag_schema_version)
    VALUES (?, ?, 'AR test recipe', 'tester', 'E.coli',
      '{"id":"V1","working_volume_L":5,"total_volume_L":16,"tare_weight_kg":12}',
      ?, '{"execution_mode":"free"}', 'approved', 1)
  `).run(recipeId, version, phases);
}

function insertReactorConfig(rawDb: Database.Database, reactorId = 'F01') {
  rawDb.prepare(`
    INSERT INTO reactor_configs (reactor_id, name, plc_protocol, plc_ip, plc_port,
      plc_rack, plc_slot, heartbeat_write, heartbeat_read, enabled, category, updated_at)
    VALUES (?, 'F01', 's7', '127.0.0.1', 102, 0, 1, 'VB400', 'VB401', 1, 'fermenter', datetime('now'))
  `).run(reactorId);
}

function fakeReactorRuntime() {
  const reactorManager = new ReactorManager();
  const calls: Array<{
    fn: 'resumeAndStart' | 'wireReactorEvents' | 'addReactor';
    args: any;
  }> = [];

  // Patch the manager's getReactor + addReactor to return a stub controller
  // exposing the resumeAndStart method we want to assert on. We do not wire
  // a real BatchController because that would touch xstate timers + PLC.
  const stubCtrl = {
    resumeAndStart: vi.fn((batchId: string, recipe: any, savedNodeId: string | null) => {
      calls.push({ fn: 'resumeAndStart', args: { batchId, recipeId: recipe?.recipe_id, savedNodeId } });
      return { success: true, message: 'ok (stub)' };
    }),
  };
  // Pre-seed manager with the stub for any reactor we look up
  (reactorManager as any).reactors = new Map();
  (reactorManager as any).reactors.set('__stub_marker__', stubCtrl);
  reactorManager.has = ((id: string) => (reactorManager as any).reactors.has(id)) as any;
  reactorManager.getReactor = ((id: string) => {
    // First call after addReactor seeds the stub for this id
    return (reactorManager as any).reactors.get(id);
  }) as any;
  reactorManager.addReactor = ((id: string, _cfg: BatchControllerConfig) => {
    calls.push({ fn: 'addReactor', args: { id } });
    (reactorManager as any).reactors.set(id, stubCtrl);
    return stubCtrl as any;
  }) as any;

  return {
    reactorManager,
    buildReactorConfig: (_id: string) => ({
      plcRead: async () => 0,
      plcWrite: async () => {},
    } as BatchControllerConfig),
    wireReactorEvents: vi.fn((id: string) => { calls.push({ fn: 'wireReactorEvents', args: { id } }); }),
    calls,
    stubCtrl,
  };
}

// Always-auto-resume policy keeps the test focused on the wiring
const alwaysAutoResume: RecoveryPolicy = { decide: () => 'auto_resume' };

// ─── teardown ───────────────────────────────────────────────────────────────

afterEach(() => {
  for (const p of tmpPaths.splice(0)) {
    try { if (existsSync(p)) unlinkSync(p); } catch { /* best effort */ }
    try { if (existsSync(p + '-wal')) unlinkSync(p + '-wal'); } catch { /* best effort */ }
    try { if (existsSync(p + '-shm')) unlinkSync(p + '-shm'); } catch { /* best effort */ }
  }
});

// ─── tests ──────────────────────────────────────────────────────────────────

describe('pickRecoveryPolicyFromEnv', () => {
  it('returns conservativeShortOutagePolicy only when env=="conservative"', () => {
    const conservative = pickRecoveryPolicyFromEnv('conservative');
    // Conservative returns auto_resume for the happy path
    expect(conservative.decide({
      prevState: 'running', commHealthy: true, ageSinceLastAuditMs: 5_000, phaseType: 'fermentation',
    })).toBe('auto_resume');
  });

  it('returns the always-hold default for undefined / empty / unknown env values', () => {
    for (const v of [undefined, '', 'default', 'aggressive', 'foo']) {
      const p = pickRecoveryPolicyFromEnv(v);
      // Always-hold even on the conservative policy's happy-path input
      expect(p.decide({
        prevState: 'running', commHealthy: true, ageSinceLastAuditMs: 5_000, phaseType: 'fermentation',
      })).toBe('hold');
    }
  });
});

describe('runOrphanRecoveryScan — F2-AUTO auto_resume branch', () => {
  beforeEach(() => {
    // Silence console during these tests; individual tests opt back in via spyOn
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls resumeAndStart and writes batch_auto_resumed audit when recipe + reactor-config present', () => {
    const { sqlite, rawDb } = makeTempSqlite();
    insertOrphanBatch(rawDb);
    insertRecipe(rawDb);
    insertReactorConfig(rawDb);
    const runtime = fakeReactorRuntime();

    runOrphanRecoveryScan({
      db: rawDb,
      sqlite: {
        writeAuditLog: (e) => sqlite.writeAuditLog(e),
        getRecipe: (id, version) => sqlite.getRecipe(id, version),
        getReactorConfig: (id) => sqlite.getReactorConfig(id),
        parseRecipeRow: (row) => ({
          ...row,
          phases: typeof row.phases === 'string' ? JSON.parse(row.phases) : row.phases,
        }),
      },
      policy: alwaysAutoResume,
      reactorRuntime: runtime,
    });

    // resumeAndStart was called with the saved node id
    expect(runtime.stubCtrl.resumeAndStart).toHaveBeenCalledOnce();
    const call = runtime.stubCtrl.resumeAndStart.mock.calls[0];
    expect(call[0]).toBe('B-AR-1');
    expect(call[2]).toBe('n_0'); // saved current_node_id

    // wireReactorEvents was called once (reactor was newly registered)
    expect(runtime.wireReactorEvents).toHaveBeenCalledWith('F01');

    // batch_auto_resumed audit was written
    const auditRow = rawDb.prepare(
      "SELECT action, batch_id, new_value FROM audit_logs WHERE batch_id = 'B-AR-1' AND action = 'batch_auto_resumed'",
    ).get() as any;
    expect(auditRow).toBeTruthy();
    expect(auditRow.action).toBe('batch_auto_resumed');
    const meta = JSON.parse(auditRow.new_value);
    expect(meta.policy_decision).toBe('auto_resume');
    expect(meta.reactor_id).toBe('F01');

    // Batch must NOT have been marked held
    const batchRow = rawDb.prepare("SELECT current_state FROM batches WHERE batch_id = 'B-AR-1'").get() as any;
    expect(batchRow.current_state).toBe('running');
  });

  it('falls back to hold + writes auto_resume_failed audit when recipe is missing', () => {
    const { sqlite, rawDb } = makeTempSqlite();
    insertOrphanBatch(rawDb); // recipe NOT inserted
    insertReactorConfig(rawDb);
    const runtime = fakeReactorRuntime();
    const warnSpy = vi.spyOn(console, 'warn');

    runOrphanRecoveryScan({
      db: rawDb,
      sqlite: {
        writeAuditLog: (e) => sqlite.writeAuditLog(e),
        getRecipe: (id, version) => sqlite.getRecipe(id, version),
        getReactorConfig: (id) => sqlite.getReactorConfig(id),
        parseRecipeRow: (row) => ({
          ...row,
          phases: typeof row.phases === 'string' ? JSON.parse(row.phases) : row.phases,
        }),
      },
      policy: alwaysAutoResume,
      reactorRuntime: runtime,
    });

    // resumeAndStart NOT called
    expect(runtime.stubCtrl.resumeAndStart).not.toHaveBeenCalled();

    // batch_held_recovery_auto_resume_failed audit row is present
    const auditRow = rawDb.prepare(
      "SELECT action, new_value FROM audit_logs WHERE batch_id = 'B-AR-1' AND action = 'batch_held_recovery_auto_resume_failed'",
    ).get() as any;
    expect(auditRow).toBeTruthy();
    const meta = JSON.parse(auditRow.new_value);
    expect(meta.fallback).toBe('hold');
    expect(meta.fallback_reason).toBe('recipe_missing');

    // Batch state was flipped to held
    const batchRow = rawDb.prepare("SELECT current_state FROM batches WHERE batch_id = 'B-AR-1'").get() as any;
    expect(batchRow.current_state).toBe('held');

    // Warn was logged about the degraded path
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('auto_resume failed'));
  });

  it('falls back to hold + warns when reactor-config is missing', () => {
    const { sqlite, rawDb } = makeTempSqlite();
    insertOrphanBatch(rawDb);
    insertRecipe(rawDb);
    // reactor_configs intentionally empty
    const runtime = fakeReactorRuntime();
    const warnSpy = vi.spyOn(console, 'warn');

    runOrphanRecoveryScan({
      db: rawDb,
      sqlite: {
        writeAuditLog: (e) => sqlite.writeAuditLog(e),
        getRecipe: (id, version) => sqlite.getRecipe(id, version),
        getReactorConfig: (id) => sqlite.getReactorConfig(id),
        parseRecipeRow: (row) => ({
          ...row,
          phases: typeof row.phases === 'string' ? JSON.parse(row.phases) : row.phases,
        }),
      },
      policy: alwaysAutoResume,
      reactorRuntime: runtime,
    });

    expect(runtime.stubCtrl.resumeAndStart).not.toHaveBeenCalled();

    const auditRow = rawDb.prepare(
      "SELECT new_value FROM audit_logs WHERE batch_id = 'B-AR-1' AND action = 'batch_held_recovery_auto_resume_failed'",
    ).get() as any;
    expect(auditRow).toBeTruthy();
    const meta = JSON.parse(auditRow.new_value);
    expect(meta.fallback_reason).toBe('reactor_config_missing');

    const batchRow = rawDb.prepare("SELECT current_state FROM batches WHERE batch_id = 'B-AR-1'").get() as any;
    expect(batchRow.current_state).toBe('held');

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('auto_resume failed'));
  });

  it('falls back to hold when reactorRuntime is omitted (back-compat with pre-v1.12.0 callers)', () => {
    const { sqlite, rawDb } = makeTempSqlite();
    insertOrphanBatch(rawDb);
    insertRecipe(rawDb);
    insertReactorConfig(rawDb);

    runOrphanRecoveryScan({
      db: rawDb,
      sqlite: {
        writeAuditLog: (e) => sqlite.writeAuditLog(e),
        getRecipe: (id, version) => sqlite.getRecipe(id, version),
        getReactorConfig: (id) => sqlite.getReactorConfig(id),
        parseRecipeRow: (row) => ({
          ...row,
          phases: typeof row.phases === 'string' ? JSON.parse(row.phases) : row.phases,
        }),
      },
      policy: alwaysAutoResume,
      // reactorRuntime omitted on purpose
    });

    const auditRow = rawDb.prepare(
      "SELECT new_value FROM audit_logs WHERE batch_id = 'B-AR-1' AND action = 'batch_held_recovery_auto_resume_failed'",
    ).get() as any;
    expect(auditRow).toBeTruthy();
    const meta = JSON.parse(auditRow.new_value);
    expect(meta.fallback_reason).toBe('reactor_runtime_unavailable');

    const batchRow = rawDb.prepare("SELECT current_state FROM batches WHERE batch_id = 'B-AR-1'").get() as any;
    expect(batchRow.current_state).toBe('held');
  });

  it('default policy (always-hold) still writes batch_held_for_recovery audit (regression)', () => {
    const { sqlite, rawDb } = makeTempSqlite();
    insertOrphanBatch(rawDb);
    insertRecipe(rawDb);
    insertReactorConfig(rawDb);
    const runtime = fakeReactorRuntime();

    runOrphanRecoveryScan({
      db: rawDb,
      sqlite: {
        writeAuditLog: (e) => sqlite.writeAuditLog(e),
        getRecipe: (id, version) => sqlite.getRecipe(id, version),
        getReactorConfig: (id) => sqlite.getReactorConfig(id),
        parseRecipeRow: (row) => ({
          ...row,
          phases: typeof row.phases === 'string' ? JSON.parse(row.phases) : row.phases,
        }),
      },
      // No policy → defaultRecoveryPolicy (always hold)
      reactorRuntime: runtime,
    });

    expect(runtime.stubCtrl.resumeAndStart).not.toHaveBeenCalled();

    const heldAudit = rawDb.prepare(
      "SELECT action FROM audit_logs WHERE batch_id = 'B-AR-1' AND action = 'batch_held_for_recovery'",
    ).get() as any;
    expect(heldAudit).toBeTruthy();

    const batchRow = rawDb.prepare("SELECT current_state FROM batches WHERE batch_id = 'B-AR-1'").get() as any;
    expect(batchRow.current_state).toBe('held');
  });
});
