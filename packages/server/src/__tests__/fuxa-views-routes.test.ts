import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SQLiteService } from '@biocore/data-service';
import { registerFuxaViewsRoutes } from '../fuxa-views-routes';

function makeApp(): { app: express.Express; sqlite: SQLiteService } {
  const db = new Database(':memory:');
  const sql = readFileSync(join(__dirname, '../../migrations/033-fuxa-views.sql'), 'utf8');
  db.exec(sql);
  db.exec(`PRAGMA foreign_keys = ON`);
  const sqlite = new SQLiteService(db);
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  // Tests bypass auth — production registers behind authMiddleware in index.ts.
  app.use((req, _res, next) => { (req as any).user = { user_id: 'test-user' }; next(); });
  const router = express.Router();
  registerFuxaViewsRoutes(router, { sqlite });
  app.use('/api/v1', router);
  return { app, sqlite };
}

function payload(): string {
  return JSON.stringify({
    id: 'x', name: 'X', type: 'svg', svgcontent: '<svg/>',
    width: 100, height: 100, items: {}, schemaVersion: 1,
  });
}

describe('fuxa-views-routes GET (SP-FX-1)', () => {
  it('GET /fuxa-views returns empty list when table empty', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/fuxa-views');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
  });

  it('GET /fuxa-views lists rows', async () => {
    const { app, sqlite } = makeApp();
    sqlite.createFuxaView({ id: 'a', name: 'A', type: 'svg', payload: payload(), width: 800, height: 600 });
    sqlite.createFuxaView({ id: 'b', name: 'B', type: 'svg', payload: payload(), width: 800, height: 600, is_template: 1 });
    const res = await request(app).get('/api/v1/fuxa-views');
    expect(res.status).toBe(200);
    expect(res.body.items.map((r: any) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('GET /fuxa-views?is_template=true filters', async () => {
    const { app, sqlite } = makeApp();
    sqlite.createFuxaView({ id: 'a', name: 'A', type: 'svg', payload: payload(), width: 100, height: 100, is_template: 0 });
    sqlite.createFuxaView({ id: 'b', name: 'B', type: 'svg', payload: payload(), width: 100, height: 100, is_template: 1 });
    const res = await request(app).get('/api/v1/fuxa-views?is_template=true');
    expect(res.status).toBe(200);
    expect(res.body.items.map((r: any) => r.id)).toEqual(['b']);
  });

  it('GET /fuxa-views/:id returns single row', async () => {
    const { app, sqlite } = makeApp();
    sqlite.createFuxaView({ id: 'v1', name: 'My View', type: 'svg', payload: payload(), width: 800, height: 600 });
    const res = await request(app).get('/api/v1/fuxa-views/v1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('v1');
    expect(res.body.name).toBe('My View');
    expect(res.body.version).toBe(1);
  });

  it('GET /fuxa-views/:id returns 404 when missing', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/fuxa-views/missing');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});
