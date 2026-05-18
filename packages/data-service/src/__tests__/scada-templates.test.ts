import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SQLiteService } from '../sqlite-service';

function makeDb(): SQLiteService {
  const db = new Database(':memory:');
  db.exec(readFileSync(join(__dirname, '../../../server/migrations/028-scada-schema.sql'), 'utf8'));
  db.exec(readFileSync(join(__dirname, '../../../server/migrations/030-scada-view-svg-flag.sql'), 'utf8'));
  db.exec(readFileSync(join(__dirname, '../../../server/migrations/031-scada-view-template-flag.sql'), 'utf8'));
  db.exec(readFileSync(join(__dirname, '../../../server/migrations/035-view-acl.sql'), 'utf8'));
  return new SQLiteService(db);
}

describe('SCADA templates', () => {
  let svc: SQLiteService;
  beforeEach(() => {
    svc = makeDb();
    svc.createScadaProject({ project_id: 'p1', name: 'P1' });
  });

  it('getScadaView returns is_template = 0 by default', () => {
    svc.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'V1' });
    const v = svc.getScadaView('v1');
    expect(v).not.toBeNull();
    expect(v!.is_template).toBe(0);
  });

  it('createScadaView accepts is_template = 1', () => {
    svc.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'T', is_template: 1 });
    expect(svc.getScadaView('v1')!.is_template).toBe(1);
  });

  it('updateScadaView sets is_template', () => {
    svc.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'V1' });
    const r = svc.updateScadaView('v1', { is_template: 1 });
    expect(r.ok).toBe(true);
    expect(svc.getScadaView('v1')!.is_template).toBe(1);
  });

  it('listScadaTemplates returns only templates of the given project', () => {
    svc.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'V1', is_template: 0 });
    svc.createScadaView({ view_id: 't1', project_id: 'p1', name: 'T1', is_template: 1 });
    svc.createScadaView({ view_id: 't2', project_id: 'p1', name: 'T2', is_template: 1 });
    svc.createScadaProject({ project_id: 'p2', name: 'P2' });
    svc.createScadaView({ view_id: 'tx', project_id: 'p2', name: 'X', is_template: 1 });
    const list = svc.listScadaTemplates('p1');
    expect(list.map(t => t.view_id).sort()).toEqual(['t1', 't2']);
  });

  it('cloneScadaView copies items + width + height + background, not is_template', () => {
    svc.createScadaView({
      view_id: 'tmpl', project_id: 'p1', name: 'Template',
      width: 1600, height: 900, background: '#222',
      items: { width: 1600, height: 900, items: [{ id: 'r1', type: 'svg-rect', x: 0, y: 0, w: 10, h: 10 }] } as any,
      is_template: 1,
    });
    svc.cloneScadaView('tmpl', 'clone1', 'Clone One', 'p1');
    const clone = svc.getScadaView('clone1');
    expect(clone).not.toBeNull();
    expect(clone!.name).toBe('Clone One');
    expect(clone!.width).toBe(1600);
    expect(clone!.height).toBe(900);
    expect(clone!.background).toBe('#222');
    expect(clone!.is_template).toBe(0);
    expect((clone!.items as any).items).toHaveLength(1);
    expect((clone!.items as any).items[0].id).toBe('r1');
  });
});
