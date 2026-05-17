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

describe('fuxa-views-routes POST (SP-FX-1)', () => {
  const body = () => ({
    id: 'new-1',
    name: 'New View',
    type: 'svg' as const,
    payload: {
      id: 'new-1', name: 'New View', type: 'svg', svgcontent: '<svg/>',
      width: 100, height: 100, items: {}, schemaVersion: 1,
    },
    width: 100,
    height: 100,
  });

  it('POST /fuxa-views creates a row and returns it with version=1', async () => {
    const { app, sqlite } = makeApp();
    const res = await request(app).post('/api/v1/fuxa-views').send(body());
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('new-1');
    expect(res.body.version).toBe(1);
    expect(sqlite.getFuxaView('new-1')).not.toBeNull();
  });

  it('POST /fuxa-views records created_by from req.user.user_id', async () => {
    const { app, sqlite } = makeApp();
    await request(app).post('/api/v1/fuxa-views').send(body());
    expect(sqlite.getFuxaView('new-1')!.created_by).toBe('test-user');
  });

  it('POST /fuxa-views with conflicting id returns 409', async () => {
    const { app, sqlite } = makeApp();
    sqlite.createFuxaView({
      id: 'dup', name: 'Old', type: 'svg', payload: '{}', width: 1, height: 1,
    });
    const res = await request(app).post('/api/v1/fuxa-views').send({ ...body(), id: 'dup' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBeDefined();
  });

  it('POST /fuxa-views with missing id returns 400', async () => {
    const { app } = makeApp();
    const b = body();
    const res = await request(app).post('/api/v1/fuxa-views').send({ ...b, id: undefined });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.field).toBe('id');
  });

  it('POST /fuxa-views with non-positive width returns 400', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/v1/fuxa-views').send({ ...body(), width: 0 });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('width');
  });

  it('POST /fuxa-views with bad payload schema returns 400', async () => {
    const { app } = makeApp();
    const b = body();
    const bad = { ...b, payload: { ...b.payload, schemaVersion: 2 } };
    const res = await request(app).post('/api/v1/fuxa-views').send(bad);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/payload/i);
  });

  it('POST /fuxa-views with invalid type returns 400', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/v1/fuxa-views').send({ ...body(), type: 'invalid' as any });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('type');
  });
});

describe('fuxa-views-routes PUT (SP-FX-1)', () => {
  function seed(sqlite: SQLiteService) {
    sqlite.createFuxaView({
      id: 'edit-1', name: 'Old', type: 'svg',
      payload: JSON.stringify({ schemaVersion: 1 }),
      width: 800, height: 600,
    });
  }

  const updateBody = () => ({
    name: 'New name',
    type: 'svg',
    payload: {
      id: 'edit-1', name: 'New name', type: 'svg', svgcontent: '<svg/>',
      width: 800, height: 600, items: {}, schemaVersion: 1,
    },
    width: 800,
    height: 600,
  });

  it('PUT /fuxa-views/:id with matching If-Match updates and bumps version', async () => {
    const { app, sqlite } = makeApp();
    seed(sqlite);
    const res = await request(app)
      .put('/api/v1/fuxa-views/edit-1')
      .set('If-Match', '1')
      .send(updateBody());
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(2);
    expect(sqlite.getFuxaView('edit-1')!.name).toBe('New name');
  });

  it('PUT with stale If-Match returns 409 + currentVersion', async () => {
    const { app, sqlite } = makeApp();
    seed(sqlite);
    sqlite.updateFuxaView('edit-1', { expectedVersion: 1, name: 'mid', payload: '{}' }); // → v2
    const res = await request(app)
      .put('/api/v1/fuxa-views/edit-1')
      .set('If-Match', '1')
      .send(updateBody());
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/stale/i);
    expect(res.body.currentVersion).toBe(2);
    expect(sqlite.getFuxaView('edit-1')!.name).toBe('mid');
  });

  it('PUT without If-Match returns 428', async () => {
    const { app, sqlite } = makeApp();
    seed(sqlite);
    const res = await request(app)
      .put('/api/v1/fuxa-views/edit-1')
      .send(updateBody());
    expect(res.status).toBe(428);
  });

  it('PUT with force=true overrides stale version', async () => {
    const { app, sqlite } = makeApp();
    seed(sqlite);
    sqlite.updateFuxaView('edit-1', { expectedVersion: 1, name: 'mid', payload: '{}' }); // → v2
    const res = await request(app)
      .put('/api/v1/fuxa-views/edit-1?force=true')
      .set('If-Match', '1')
      .send(updateBody());
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(3);
    expect(sqlite.getFuxaView('edit-1')!.name).toBe('New name');
  });

  it('PUT for missing id returns 404', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .put('/api/v1/fuxa-views/missing')
      .set('If-Match', '1')
      .send(updateBody());
    expect(res.status).toBe(404);
  });

  it('PUT with bad zod body returns 400', async () => {
    const { app, sqlite } = makeApp();
    seed(sqlite);
    const b = updateBody();
    const res = await request(app)
      .put('/api/v1/fuxa-views/edit-1')
      .set('If-Match', '1')
      .send({ ...b, width: -10 });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('width');
  });
});
