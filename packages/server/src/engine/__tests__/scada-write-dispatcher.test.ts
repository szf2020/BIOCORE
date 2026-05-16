import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SQLiteService } from '@biocore/data-service';
import { dispatchTick, DispatchError, startScadaWriteDispatcher } from '../scada-write-dispatcher';
import { MockPlcWriter } from '../plc-writer';

function setup() {
  const db = new Database(':memory:');
  const migrationsDir = join(__dirname, '../../../migrations');
  db.exec(readFileSync(join(migrationsDir, '001-baseline-schema.sql'), 'utf8'));
  db.exec(readFileSync(join(migrationsDir, '003-add-trace-fields.sql'), 'utf8'));
  db.exec(readFileSync(join(migrationsDir, '007-add-recipe-v2-fields.sql'), 'utf8'));
  db.exec(readFileSync(join(migrationsDir, '008-recipe-status-pending.sql'), 'utf8'));
  db.exec(readFileSync(join(migrationsDir, '013-recipe-deprecation.sql'), 'utf8'));
  db.exec(readFileSync(join(migrationsDir, '023-batch-current-node.sql'), 'utf8'));
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
  const sqlite = new SQLiteService(db);
  const writer = new MockPlcWriter();
  const mappingManager = {
    getVariables: () => [{
      id: 'v1', tag_name: 'F01.SP-temp', plc_address: 'DB1.DBD0',
      data_type: 'real', direction: 'write', scaling_enabled: 0,
      eng_min: 0, eng_max: 100, connection_id: 'c1', enabled: 1,
    }],
    getConnections: () => [{ id: 'c1', protocol: 's7', ip: '127.0.0.1', port: 102, rack: 0, slot: 1, s7_db: 1, enabled: 1 }],
  } as any;
  const broadcasts: any[] = [];
  const broadcast = (ch: string, p: any) => broadcasts.push({ ch, p });
  return { db, sqlite, writer, mappingManager, broadcasts, broadcast,
    writerFactory: (_proto: string) => writer };
}

describe('scada-write-dispatcher', () => {
  it('dispatchTick picks up pending row → marks dispatched (mock writer called)', async () => {
    const { db, sqlite, writer, mappingManager, broadcasts, broadcast, writerFactory } = setup();
    const id = sqlite.createSuggestion({
      batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
      target_param: 'F01.SP-temp', suggested_value: 38, reasoning: '{}',
    });
    sqlite.setDispatchPending(id);

    await dispatchTick({ sqlite, broadcast, writerFactory, mappingManager });

    const row: any = db.prepare('SELECT * FROM ai_suggestions WHERE id=?').get(id);
    expect(row.dispatch_status).toBe('dispatched');
    expect(row.dispatched_at).toBeTruthy();
    expect(writer.read('c1', 'DB1.DBD0')).toBe(38);
    expect(broadcasts.some(b => b.ch === 'ai_suggestion' && b.p.action === 'dispatched')).toBe(true);
  });

  it('writer failure → retry_count=1, status back to pending_dispatch', async () => {
    const { db, sqlite, mappingManager, broadcast } = setup();
    const id = sqlite.createSuggestion({
      batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
      target_param: 'F01.SP-temp', suggested_value: 38, reasoning: '{}',
    });
    sqlite.setDispatchPending(id);
    const failingWriter = { write: async () => { throw new Error('PLC timeout'); } };

    await dispatchTick({ sqlite, broadcast, writerFactory: () => failingWriter as any, mappingManager });

    const row: any = db.prepare('SELECT * FROM ai_suggestions WHERE id=?').get(id);
    expect(row.dispatch_status).toBe('pending_dispatch');
    expect(row.dispatch_retry_count).toBe(1);
  });

  it('3rd failure → status=failed + audit_log row', async () => {
    const { db, sqlite, mappingManager, broadcast } = setup();
    const id = sqlite.createSuggestion({
      batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
      target_param: 'F01.SP-temp', suggested_value: 38, reasoning: '{}',
    });
    sqlite.setDispatchPending(id);
    const failingWriter = { write: async () => { throw new Error('PLC timeout'); } };
    const wf = () => failingWriter as any;

    await dispatchTick({ sqlite, broadcast, writerFactory: wf, mappingManager });
    sqlite.setDispatchPending(id);
    await dispatchTick({ sqlite, broadcast, writerFactory: wf, mappingManager });
    sqlite.setDispatchPending(id);
    await dispatchTick({ sqlite, broadcast, writerFactory: wf, mappingManager });

    const row: any = db.prepare('SELECT * FROM ai_suggestions WHERE id=?').get(id);
    expect(row.dispatch_status).toBe('failed');
    expect(row.dispatch_error).toMatch(/PLC timeout/);
    const audit: any = db.prepare(`SELECT * FROM audit_logs WHERE action='ai_suggestion_dispatch_failed' AND target_id=?`).get(String(id));
    expect(audit).toBeTruthy();
  });

  it('NO_MAPPING — permanent failure (no retry)', async () => {
    const { db, sqlite, broadcast } = setup();
    const id = sqlite.createSuggestion({
      batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
      target_param: 'Unknown.Tag', suggested_value: 1, reasoning: '{}',
    });
    sqlite.setDispatchPending(id);
    const emptyMM = { getVariables: () => [], getConnections: () => [] } as any;

    await dispatchTick({ sqlite, broadcast, writerFactory: () => ({ write: async () => {} } as any), mappingManager: emptyMM });

    const row: any = db.prepare('SELECT * FROM ai_suggestions WHERE id=?').get(id);
    expect(row.dispatch_status).toBe('failed');
    expect(row.dispatch_error).toMatch(/no mapping/);
    expect(row.dispatch_retry_count).toBe(0);
  });
});

describe('startScadaWriteDispatcher lifecycle', () => {
  it('on start, rolls back dispatching rows to pending_dispatch', () => {
    const { db, sqlite, mappingManager, writerFactory, broadcast } = setup();
    const id = sqlite.createSuggestion({
      batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
      target_param: 'F01.SP-temp', suggested_value: 1, reasoning: '{}',
    });
    sqlite.setDispatchPending(id);
    db.prepare("UPDATE ai_suggestions SET dispatch_status='dispatching' WHERE id=?").run(id);

    const handle = startScadaWriteDispatcher({ sqlite, mappingManager, writerFactory, broadcast, tickMs: 60_000 });
    try {
      const row: any = db.prepare('SELECT dispatch_status FROM ai_suggestions WHERE id=?').get(id);
      expect(row.dispatch_status).toBe('pending_dispatch');
    } finally {
      handle.stop();
    }
  });
});
