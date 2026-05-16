import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SQLiteService } from '../sqlite-service';

function makeDb(): SQLiteService {
  const db = new Database(':memory:');
  db.exec(readFileSync(join(__dirname, '../../../server/migrations/028-scada-schema.sql'), 'utf8'));
  db.exec(readFileSync(join(__dirname, '../../../server/migrations/030-scada-view-svg-flag.sql'), 'utf8'));
  return new SQLiteService(db);
}

describe('SCADA project CRUD', () => {
  let svc: SQLiteService;
  beforeEach(() => { svc = makeDb(); });

  it('createScadaProject + getScadaProject round-trip', () => {
    svc.createScadaProject({ project_id: 'proj_1', name: 'Plant A', description: 'demo', created_by: 'u1' });
    const got = svc.getScadaProject('proj_1');
    expect(got).not.toBeNull();
    expect(got!.name).toBe('Plant A');
    expect(got!.description).toBe('demo');
    expect(got!.created_by).toBe('u1');
  });

  it('listScadaProjects returns all', () => {
    svc.createScadaProject({ project_id: 'proj_a', name: 'A' });
    svc.createScadaProject({ project_id: 'proj_b', name: 'B' });
    const list = svc.listScadaProjects();
    expect(list).toHaveLength(2);
    expect(list.map(p => p.project_id).sort()).toEqual(['proj_a', 'proj_b']);
  });

  it('updateScadaProject patches name', () => {
    svc.createScadaProject({ project_id: 'proj_x', name: 'old' });
    const ok = svc.updateScadaProject('proj_x', { name: 'new' });
    expect(ok).toBe(true);
    expect(svc.getScadaProject('proj_x')!.name).toBe('new');
  });

  it('updateScadaProject returns false for missing id', () => {
    expect(svc.updateScadaProject('missing', { name: 'x' })).toBe(false);
  });

  it('deleteScadaProject cascades to views', () => {
    svc.createScadaProject({ project_id: 'p1', name: 'P' });
    svc.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'View 1' });
    svc.createScadaView({ view_id: 'v2', project_id: 'p1', name: 'View 2' });
    const r = svc.deleteScadaProject('p1');
    expect(r.deleted_views).toBe(2);
    expect(svc.getScadaProject('p1')).toBeNull();
    expect(svc.getScadaView('v1')).toBeNull();
  });

  it('duplicate project_id throws', () => {
    svc.createScadaProject({ project_id: 'dup', name: 'A' });
    expect(() => svc.createScadaProject({ project_id: 'dup', name: 'B' })).toThrow();
  });
});

describe('SCADA view CRUD', () => {
  let svc: SQLiteService;
  beforeEach(() => {
    svc = makeDb();
    svc.createScadaProject({ project_id: 'p1', name: 'P' });
  });

  it('createScadaView + getScadaView round-trip with items', () => {
    const items = { w1: { type: 'tank', x: 10, y: 20, w: 100, h: 200, props: { color: 'blue' } } };
    svc.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'View 1', items });
    const got = svc.getScadaView('v1');
    expect(got).not.toBeNull();
    expect(got!.name).toBe('View 1');
    expect(got!.items).toEqual(items);
  });

  it('items_json round-trip preserves nested widget tree', () => {
    const items = {
      tank1: { type: 'tank', x: 0, y: 0, w: 100, h: 100, props: { fill: '#abc' }, bindings: [{ tag: 'F01.AI-0', prop: 'value' }] },
      trend1: { type: 'trend', x: 100, y: 0, w: 400, h: 200, props: { series: ['F01.AI-0', 'F01.AI-1'], yMin: 0, yMax: 100 } },
    };
    svc.createScadaView({ view_id: 'v_nested', project_id: 'p1', name: 'Nested', items });
    expect(svc.getScadaView('v_nested')!.items).toEqual(items);
  });

  it('listScadaViewsByProject returns project views', () => {
    svc.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'A' });
    svc.createScadaView({ view_id: 'v2', project_id: 'p1', name: 'B' });
    const list = svc.listScadaViewsByProject('p1');
    expect(list).toHaveLength(2);
    expect((list[0] as any).items).toBeUndefined();
  });

  it('listScadaViewsByReactor returns reactor-specific + generic (NULL) views', () => {
    svc.createScadaView({ view_id: 'v_f01', project_id: 'p1', name: 'F01 view', reactor_id: 'F01' });
    svc.createScadaView({ view_id: 'v_f02', project_id: 'p1', name: 'F02 view', reactor_id: 'F02' });
    svc.createScadaView({ view_id: 'v_generic', project_id: 'p1', name: 'Generic' });
    const list = svc.listScadaViewsByReactor('F01');
    const ids = list.map(v => v.view_id).sort();
    expect(ids).toEqual(['v_f01', 'v_generic']);
  });

  it('updateScadaView patches metadata + items', () => {
    svc.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'old' });
    const r = svc.updateScadaView('v1', { name: 'new', items: { x: { type: 'btn', x: 0, y: 0, w: 50, h: 50, props: {} } } });
    expect(r.ok).toBe(true);
    const got = svc.getScadaView('v1')!;
    expect(got.name).toBe('new');
    expect(got.items.x.type).toBe('btn');
  });

  it('updateScadaView returns conflict when expected_updated_at mismatches', () => {
    svc.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'A' });
    const r = svc.updateScadaView('v1', { name: 'B', expected_updated_at: '1970-01-01 00:00:00' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect((r as any).conflict).toBe(true);
      expect((r as any).current_updated_at).toBeTruthy();
    }
  });

  it('updateScadaView accepts matching expected_updated_at', () => {
    svc.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'A' });
    const cur = svc.getScadaView('v1')!.updated_at;
    const r = svc.updateScadaView('v1', { name: 'B', expected_updated_at: cur });
    expect(r.ok).toBe(true);
  });

  it('deleteScadaView returns true and removes row', () => {
    svc.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'X' });
    expect(svc.deleteScadaView('v1')).toBe(true);
    expect(svc.getScadaView('v1')).toBeNull();
    expect(svc.deleteScadaView('v1')).toBe(false);
  });
});
