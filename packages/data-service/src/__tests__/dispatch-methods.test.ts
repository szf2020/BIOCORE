import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SQLiteService } from '../sqlite-service';

function makeDb(): { db: Database.Database; svc: SQLiteService } {
  const db = new Database(':memory:');
  // Load schema migrations needed: baseline + recipe v2 fields + status enum + deprecation + dispatch
  const migrationsDir = join(__dirname, '../../../server/migrations');
  db.exec(readFileSync(join(migrationsDir, '001-baseline-schema.sql'), 'utf8'));
  db.exec(readFileSync(join(migrationsDir, '007-add-recipe-v2-fields.sql'), 'utf8'));
  db.exec(readFileSync(join(migrationsDir, '008-recipe-status-pending.sql'), 'utf8'));
  db.exec(readFileSync(join(migrationsDir, '013-recipe-deprecation.sql'), 'utf8'));
  db.exec(readFileSync(join(migrationsDir, '029-scada-dispatch.sql'), 'utf8'));
  db.exec(readFileSync(join(migrationsDir, '032-ai-suggestion-suggested-value-raw.sql'), 'utf8'));
  // Seed: recipe + batch required for FK on ai_suggestions
  db.prepare(
    `INSERT INTO recipes (recipe_id, version, name, author, vessel_config, phases, created_by)
     VALUES ('R1', '1.0.0', 'Test', 'tester', '{}', '[]', 'tester')`
  ).run();
  db.prepare(
    `INSERT INTO batches (batch_id, recipe_id, recipe_version, operator_id, total_phases)
     VALUES ('b1', 'R1', '1.0.0', 'op1', 1)`
  ).run();
  const svc = new SQLiteService(db);
  return { db, svc };
}

describe('SQLiteService dispatch methods', () => {
  it('setDispatchPending only marks widget_button + scada rows', () => {
    const { db, svc } = makeDb();
    const sc = svc.createSuggestion({
      batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
      target_param: 'F01.SP-temp', suggested_value: 38, reasoning: '{}',
    });
    const ai = svc.createSuggestion({
      batch_id: 'b1', suggestion_type: 'setpoint_adjust', source_module: 'ai_auto',
      target_param: 'F01.SP-pH', suggested_value: 7.2, reasoning: 'auto',
    });
    svc.setDispatchPending(sc);
    svc.setDispatchPending(ai);
    const scRow: any = db.prepare('SELECT dispatch_status FROM ai_suggestions WHERE id=?').get(sc);
    const aiRow: any = db.prepare('SELECT dispatch_status FROM ai_suggestions WHERE id=?').get(ai);
    expect(scRow.dispatch_status).toBe('pending_dispatch');
    expect(aiRow.dispatch_status).toBeNull();
  });

  it('claimPendingDispatches returns rows and marks them dispatching', () => {
    const { db, svc } = makeDb();
    const a = svc.createSuggestion({
      batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
      target_param: 'T1', suggested_value: 1, reasoning: '{}',
    });
    const b = svc.createSuggestion({
      batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
      target_param: 'T2', suggested_value: 2, reasoning: '{}',
    });
    svc.setDispatchPending(a);
    svc.setDispatchPending(b);

    const claimed = svc.claimPendingDispatches(10);
    expect(claimed.length).toBe(2);
    expect(claimed.map((r: any) => r.id).sort()).toEqual([a, b].sort());
    const after: any = db.prepare('SELECT dispatch_status FROM ai_suggestions WHERE id=?').get(a);
    expect(after.dispatch_status).toBe('dispatching');
    // Re-claim returns empty (already moved to dispatching)
    expect(svc.claimPendingDispatches(10).length).toBe(0);
  });

  it('markDispatched sets status + dispatched_at', () => {
    const { db, svc } = makeDb();
    const id = svc.createSuggestion({
      batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
      target_param: 'T1', suggested_value: 1, reasoning: '{}',
    });
    svc.setDispatchPending(id);
    svc.claimPendingDispatches(10);
    svc.markDispatched(id);
    const row: any = db.prepare('SELECT * FROM ai_suggestions WHERE id=?').get(id);
    expect(row.dispatch_status).toBe('dispatched');
    expect(row.dispatched_at).toBeTruthy();
    expect(row.dispatch_error).toBeNull();
  });

  it('retryFailedDispatch resets failed → pending_dispatch (retry_count=0, error=NULL); returns false if not failed', () => {
    const { db, svc } = makeDb();
    const id = svc.createSuggestion({
      batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
      target_param: 'T1', suggested_value: 1, reasoning: '{}',
    });
    svc.setDispatchPending(id);
    svc.claimPendingDispatches(10);
    svc.incrementDispatchRetry(id);
    svc.incrementDispatchRetry(id);
    svc.markDispatchFailed(id, 'PLC timeout');

    expect(svc.retryFailedDispatch(id)).toBe(true);
    const row: any = db.prepare('SELECT * FROM ai_suggestions WHERE id=?').get(id);
    expect(row.dispatch_status).toBe('pending_dispatch');
    expect(row.dispatch_retry_count).toBe(0);
    expect(row.dispatch_error).toBeNull();

    // calling again when status != 'failed' returns false
    expect(svc.retryFailedDispatch(id)).toBe(false);
  });

  it('markDispatchFailed/incrementDispatchRetry/rollbackInProgressDispatches work as documented', () => {
    const { db, svc } = makeDb();
    const id = svc.createSuggestion({
      batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
      target_param: 'T1', suggested_value: 1, reasoning: '{}',
    });
    svc.setDispatchPending(id);
    svc.claimPendingDispatches(10);

    // incrementDispatchRetry: puts back to pending_dispatch and bumps counter
    svc.incrementDispatchRetry(id);
    const r1: any = db.prepare('SELECT * FROM ai_suggestions WHERE id=?').get(id);
    expect(r1.dispatch_status).toBe('pending_dispatch');
    expect(r1.dispatch_retry_count).toBe(1);

    // markDispatchFailed: sets failed + error message
    svc.markDispatchFailed(id, 'PLC timeout');
    const r2: any = db.prepare('SELECT * FROM ai_suggestions WHERE id=?').get(id);
    expect(r2.dispatch_status).toBe('failed');
    expect(r2.dispatch_error).toBe('PLC timeout');

    // rollbackInProgressDispatches: moves dispatching rows back to pending_dispatch
    db.prepare("UPDATE ai_suggestions SET dispatch_status='dispatching' WHERE id=?").run(id);
    svc.rollbackInProgressDispatches();
    const r3: any = db.prepare('SELECT * FROM ai_suggestions WHERE id=?').get(id);
    expect(r3.dispatch_status).toBe('pending_dispatch');
  });
});
