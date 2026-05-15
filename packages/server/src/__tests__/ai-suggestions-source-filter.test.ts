import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SQLiteService } from '@biocore/data-service';

function makeApp(): { app: express.Express; sqlite: SQLiteService } {
  const db = new Database(':memory:');
  const migrationSql = readFileSync(
    join(__dirname, '../../migrations/001-baseline-schema.sql'),
    'utf8'
  );
  db.exec(migrationSql);

  const sqlite = new SQLiteService(db);

  const app = express();
  app.use(express.json());

  const apiRouter = express.Router();

  // Mirror the production handler from index.ts (inline — verifies the wiring logic)
  apiRouter.get('/ai/suggestions', (req, res) => {
    const status = (req.query.status as string) || 'pending';
    const batchId = req.query.batch_id as string | undefined;
    const source = req.query.source_module as string | undefined;
    if (status === 'pending') {
      sqlite.expirePendingSuggestions(batchId || '');
      return res.json(sqlite.getPendingSuggestionsBySource(batchId, source));
    }
    const clauses: string[] = ['status = ?'];
    const params: any[] = [status];
    if (batchId) { clauses.push('batch_id = ?'); params.push(batchId); }
    if (source) { clauses.push('source_module = ?'); params.push(source); }
    const sql = `SELECT * FROM ai_suggestions WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT 50`;
    return res.json(sqlite.getDatabase().prepare(sql).all(...params));
  });

  app.use('/api/v1', apiRouter);
  return { app, sqlite };
}

function seedData(sqlite: SQLiteService) {
  // Insert prerequisite recipe using raw SQL to avoid migration-version mismatch
  // (baseline schema has simpler recipes schema without dag_schema_version)
  sqlite.getDatabase().prepare(`
    INSERT INTO recipes (recipe_id, version, name, author, vessel_config, phases, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('r1', '1.0', 'Test Recipe', 'tester', '{}', '[]', 'tester');

  // Insert batch (ai_suggestions FK → batches)
  sqlite.createBatch({
    batch_id: 'b1',
    recipe_id: 'r1',
    recipe_version: '1.0',
    operator_id: 'op1',
    total_phases: 1,
  });

  // Suggestion from 'scada' module
  sqlite.createSuggestion({
    batch_id: 'b1',
    suggestion_type: 'setpoint_adjust',
    source_module: 'scada',
    target_param: 'F01.SP-temp',
    suggested_value: 37.5,
    confidence: 0.9,
  });

  // Suggestion from 'ai_auto' module
  sqlite.createSuggestion({
    batch_id: 'b1',
    suggestion_type: 'setpoint_adjust',
    source_module: 'ai_auto',
    target_param: 'F01.SP-pH',
    suggested_value: 7.0,
    confidence: 0.85,
  });
}

describe('GET /ai/suggestions source_module filter', () => {
  it('returns only scada rows when source_module=scada', async () => {
    const { app, sqlite } = makeApp();
    seedData(sqlite);

    const res = await request(app)
      .get('/api/v1/ai/suggestions?status=pending&source_module=scada')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].source_module).toBe('scada');
    expect(res.body[0].target_param).toBe('F01.SP-temp');
  });

  it('returns all pending rows when source_module is omitted (backward compat)', async () => {
    const { app, sqlite } = makeApp();
    seedData(sqlite);

    const res = await request(app)
      .get('/api/v1/ai/suggestions?status=pending')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    const modules = res.body.map((r: any) => r.source_module).sort();
    expect(modules).toEqual(['ai_auto', 'scada']);
  });
});
