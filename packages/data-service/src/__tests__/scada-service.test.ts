import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SQLiteService } from '../sqlite-service';

function makeDb(): SQLiteService {
  const db = new Database(':memory:');
  const sql = readFileSync(join(__dirname, '../../../server/migrations/028-scada-schema.sql'), 'utf8');
  db.exec(sql);
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
