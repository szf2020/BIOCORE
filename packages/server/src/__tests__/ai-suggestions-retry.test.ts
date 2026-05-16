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
const broadcasts: Array<{ ch: string; p: any }> = [];

beforeAll(() => {
  db = new Database(':memory:');
  const migrations = [
    '001-baseline-schema.sql',
    '003-add-trace-fields.sql',
    '007-add-recipe-v2-fields.sql',
    '008-recipe-status-pending.sql',
    '013-recipe-deprecation.sql',
    '023-batch-current-node.sql',
    '029-scada-dispatch.sql',
  ];
  for (const m of migrations) {
    db.exec(readFileSync(join(__dirname, '../../migrations', m), 'utf8'));
  }
  db.prepare(
    `INSERT INTO recipes (recipe_id, version, name, author, vessel_config, phases, created_by)
     VALUES ('R1', '1.0.0', 'Test', 'tester', '{}', '[]', 'tester')`
  ).run();
  db.prepare(
    `INSERT INTO batches (batch_id, recipe_id, recipe_version, operator_id, total_phases)
     VALUES ('b1', 'R1', '1.0.0', 'op1', 1)`
  ).run();
  svc = new SQLiteService(db);

  app = express();
  app.use(express.json());
  app.use((req: any, _r, n) => { req.user = { user_id: 'admin-001', role: 'admin' }; n(); });
  const broadcast = (ch: string, p: any) => broadcasts.push({ ch, p });

  app.post('/ai/suggestions/:id/retry-dispatch', (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const ok = svc.retryFailedDispatch(id);
      if (!ok) return res.status(409).json({ error: 'suggestion not in failed dispatch state' });
      svc.writeAuditLog({
        user_id: req.user.user_id, action: 'ai_suggestion_dispatch_retry',
        target_type: 'ai_suggestion', target_id: req.params.id,
      });
      broadcast('ai_suggestion', { id, action: 'dispatch_retry', source_module: 'scada' });
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });
});

describe('POST /ai/suggestions/:id/retry-dispatch', () => {
  it('resets failed → pending_dispatch (success path)', async () => {
    const id = svc.createSuggestion({
      batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
      target_param: 'F01.SP-temp', suggested_value: 38, reasoning: '{}',
    });
    svc.setDispatchPending(id);
    svc.claimPendingDispatches(10);
    svc.markDispatchFailed(id, 'PLC offline');

    const r = await request(app).post(`/ai/suggestions/${id}/retry-dispatch`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);

    const row: any = db.prepare('SELECT * FROM ai_suggestions WHERE id=?').get(id);
    expect(row.dispatch_status).toBe('pending_dispatch');
    expect(row.dispatch_retry_count).toBe(0);
    expect(row.dispatch_error).toBeNull();

    const audit: any = db.prepare(`SELECT * FROM audit_logs WHERE action='ai_suggestion_dispatch_retry' AND target_id=?`).get(String(id));
    expect(audit).toBeTruthy();

    const bc = broadcasts.find(b => b.p.id === id && b.p.action === 'dispatch_retry');
    expect(bc).toBeTruthy();
    expect(bc!.p.source_module).toBe('scada');
  });

  it('returns 409 when suggestion not in failed state', async () => {
    const id = svc.createSuggestion({
      batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
      target_param: 'X', suggested_value: 1, reasoning: '{}',
    });
    svc.setDispatchPending(id);
    const r = await request(app).post(`/ai/suggestions/${id}/retry-dispatch`);
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/failed dispatch state/);
  });

  it('returns 409 for unknown id', async () => {
    const r = await request(app).post('/ai/suggestions/99999/retry-dispatch');
    expect(r.status).toBe(409);
  });
});
