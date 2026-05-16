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
let scadaId: number;

beforeAll(() => {
  db = new Database(':memory:');
  // Use the same migration set as dispatch-methods.test.ts (authoritative)
  const migrationsDir = join(__dirname, '../../migrations');
  db.exec(readFileSync(join(migrationsDir, '001-baseline-schema.sql'), 'utf8'));
  db.exec(readFileSync(join(migrationsDir, '003-add-trace-fields.sql'), 'utf8'));
  db.exec(readFileSync(join(migrationsDir, '007-add-recipe-v2-fields.sql'), 'utf8'));
  db.exec(readFileSync(join(migrationsDir, '008-recipe-status-pending.sql'), 'utf8'));
  db.exec(readFileSync(join(migrationsDir, '013-recipe-deprecation.sql'), 'utf8'));
  db.exec(readFileSync(join(migrationsDir, '023-batch-current-node.sql'), 'utf8'));
  db.exec(readFileSync(join(migrationsDir, '029-scada-dispatch.sql'), 'utf8'));
  db.exec(readFileSync(join(migrationsDir, '032-ai-suggestion-suggested-value-raw.sql'), 'utf8'));

  // Seed: recipe + batch required for FK on ai_suggestions (copied from dispatch-methods.test.ts)
  db.prepare(
    `INSERT INTO recipes (recipe_id, version, name, author, vessel_config, phases, created_by)
     VALUES ('R1', '1.0.0', 'Test', 'tester', '{}', '[]', 'tester')`
  ).run();
  db.prepare(
    `INSERT INTO batches (batch_id, recipe_id, recipe_version, operator_id, total_phases)
     VALUES ('b1', 'R1', '1.0.0', 'op1', 1)`
  ).run();

  svc = new SQLiteService(db);
  scadaId = svc.createSuggestion({
    batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
    target_param: 'F01.SP-temp', suggested_value: 38, reasoning: '{}',
  });

  app = express();
  app.use(express.json());
  app.use((req: any, _r, n) => { req.user = { user_id: 'admin-001', role: 'admin' }; n(); });
  // Mirror the production accept handler as modified by Task 8 in index.ts
  app.post('/ai/suggestions/:id/accept', (req: any, res) => {
    try {
      svc.acceptSuggestion(parseInt(req.params.id), req.user.user_id);
      svc.setDispatchPending(parseInt(req.params.id));
      svc.writeAuditLog({
        user_id: req.user.user_id, action: 'ai_suggestion_accept',
        target_type: 'ai_suggestion', target_id: req.params.id,
      });
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
});

describe('POST /ai/suggestions/:id/accept', () => {
  it('marks SCADA suggestion as pending_dispatch after accept', async () => {
    const r = await request(app).post(`/ai/suggestions/${scadaId}/accept`);
    expect(r.status).toBe(200);
    const row: any = db.prepare('SELECT * FROM ai_suggestions WHERE id=?').get(scadaId);
    expect(row.status).toBe('accepted');
    expect(row.dispatch_status).toBe('pending_dispatch');
  });
});
