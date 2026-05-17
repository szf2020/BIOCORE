import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SQLiteService } from '../sqlite-service';

function makeService(): SQLiteService {
  const db = new Database(':memory:');
  const sql = readFileSync(
    join(__dirname, '../../../server/migrations/033-fuxa-views.sql'),
    'utf8',
  );
  db.exec(sql);
  return new SQLiteService(db);
}

function payload(): string {
  return JSON.stringify({ schemaVersion: 1, items: {}, variables: {} });
}

describe('SQLiteService fuxa_views CRUD (SP-FX-1)', () => {
  let svc: SQLiteService;
  beforeEach(() => { svc = makeService(); });

  it('createFuxaView inserts a row with version=1', () => {
    svc.createFuxaView({
      id: 'v1', name: 'View 1', type: 'svg', payload: payload(),
      width: 800, height: 600, created_by: 'admin-001',
    });
    const row = svc.getFuxaView('v1');
    expect(row).not.toBeNull();
    expect(row!.id).toBe('v1');
    expect(row!.name).toBe('View 1');
    expect(row!.version).toBe(1);
    expect(row!.is_template).toBe(0);
  });

  it('getFuxaView returns null for missing id', () => {
    expect(svc.getFuxaView('nope')).toBeNull();
  });

  it('listFuxaViews returns rows sorted by updated_at desc, filtered by is_template', () => {
    svc.createFuxaView({ id: 'a', name: 'A', type: 'svg', payload: payload(), width: 100, height: 100, is_template: 0 });
    svc.createFuxaView({ id: 'b', name: 'B', type: 'svg', payload: payload(), width: 100, height: 100, is_template: 1 });
    svc.createFuxaView({ id: 'c', name: 'C', type: 'svg', payload: payload(), width: 100, height: 100, is_template: 0 });
    expect(svc.listFuxaViews({}).map((r) => r.id).sort()).toEqual(['a', 'b', 'c']);
    expect(svc.listFuxaViews({ isTemplate: true }).map((r) => r.id)).toEqual(['b']);
    expect(svc.listFuxaViews({ isTemplate: false }).map((r) => r.id).sort()).toEqual(['a', 'c']);
  });

  it('updateFuxaView with matching version increments version', () => {
    svc.createFuxaView({ id: 'v', name: 'N', type: 'svg', payload: payload(), width: 800, height: 600 });
    const ok = svc.updateFuxaView('v', { expectedVersion: 1, name: 'N2', payload: payload(), updated_by: 'admin-001' });
    expect(ok).toBe(true);
    expect(svc.getFuxaView('v')!.version).toBe(2);
    expect(svc.getFuxaView('v')!.name).toBe('N2');
  });

  it('updateFuxaView with stale version returns false and writes nothing', () => {
    svc.createFuxaView({ id: 'v', name: 'N', type: 'svg', payload: payload(), width: 800, height: 600 });
    svc.updateFuxaView('v', { expectedVersion: 1, name: 'first', payload: payload() });
    const ok = svc.updateFuxaView('v', { expectedVersion: 1, name: 'stale', payload: payload() });
    expect(ok).toBe(false);
    expect(svc.getFuxaView('v')!.name).toBe('first');
    expect(svc.getFuxaView('v')!.version).toBe(2);
  });

  it('updateFuxaView with force=true overrides stale version', () => {
    svc.createFuxaView({ id: 'v', name: 'N', type: 'svg', payload: payload(), width: 800, height: 600 });
    svc.updateFuxaView('v', { expectedVersion: 1, name: 'first', payload: payload() });
    const ok = svc.updateFuxaView('v', { expectedVersion: 1, name: 'forced', payload: payload(), force: true });
    expect(ok).toBe(true);
    expect(svc.getFuxaView('v')!.name).toBe('forced');
    expect(svc.getFuxaView('v')!.version).toBe(3);
  });

  it('updateFuxaView preserves created_at + created_by', () => {
    svc.createFuxaView({ id: 'v', name: 'N', type: 'svg', payload: payload(), width: 800, height: 600, created_by: 'creator' });
    const before = svc.getFuxaView('v')!;
    svc.updateFuxaView('v', { expectedVersion: 1, name: 'N2', payload: payload(), updated_by: 'editor' });
    const after = svc.getFuxaView('v')!;
    expect(after.created_by).toBe('creator');
    expect(after.created_at).toBe(before.created_at);
    expect(after.updated_by).toBe('editor');
  });

  it('deleteFuxaView removes the row', () => {
    svc.createFuxaView({ id: 'v', name: 'N', type: 'svg', payload: payload(), width: 100, height: 100 });
    svc.deleteFuxaView('v');
    expect(svc.getFuxaView('v')).toBeNull();
  });

  it('deleteFuxaView SET NULL cascades parent_view_id on children', () => {
    svc.createFuxaView({ id: 'parent', name: 'P', type: 'svg', payload: payload(), width: 100, height: 100 });
    svc.createFuxaView({ id: 'child',  name: 'C', type: 'svg', payload: payload(), width: 100, height: 100, parent_view_id: 'parent' });
    svc.deleteFuxaView('parent');
    const child = svc.getFuxaView('child')!;
    expect(child.parent_view_id).toBeNull();
  });

  it('duplicateFuxaView produces a new id, name+" Copy", version reset to 1', () => {
    svc.createFuxaView({ id: 'orig', name: 'Orig', type: 'svg', payload: payload(), width: 800, height: 600, created_by: 'a' });
    svc.updateFuxaView('orig', { expectedVersion: 1, name: 'Orig', payload: payload() });
    const newId = svc.duplicateFuxaView('orig', { newId: 'orig-copy', userId: 'a' });
    expect(newId).toBe('orig-copy');
    const copy = svc.getFuxaView('orig-copy')!;
    expect(copy.name).toBe('Orig Copy');
    expect(copy.version).toBe(1);
    expect(copy.payload).toBe(svc.getFuxaView('orig')!.payload);
  });
});
