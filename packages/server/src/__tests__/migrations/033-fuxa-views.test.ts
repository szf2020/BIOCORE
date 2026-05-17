import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function applyAll(): Database.Database {
  const db = new Database(':memory:');
  // 033 depends on no other tables; load standalone for a focused test.
  const sql = readFileSync(
    join(__dirname, '../../../migrations/033-fuxa-views.sql'),
    'utf8',
  );
  db.exec(sql);
  return db;
}

describe('migration 033-fuxa-views', () => {
  it('creates fuxa_views table with the expected columns', () => {
    const db = applyAll();
    const cols = db.prepare(`PRAGMA table_info(fuxa_views)`).all() as Array<{
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
    }>;
    const names = cols.map((c) => c.name).sort();
    expect(names).toEqual(
      [
        'created_at',
        'created_by',
        'height',
        'id',
        'is_template',
        'name',
        'parent_view_id',
        'payload',
        'type',
        'updated_at',
        'updated_by',
        'version',
        'width',
      ].sort(),
    );
    // Spot-check NOT NULL constraints + defaults
    const byName = Object.fromEntries(cols.map((c) => [c.name, c]));
    // Primary keys are implicitly not null in SQLite; PRAGMA table_info may not reflect it explicitly
    expect(byName.payload.notnull).toBe(1);
    expect(byName.name.notnull).toBe(1);
    expect(byName.version.dflt_value).toBe('1');
    expect(byName.is_template.dflt_value).toBe('0');
  });

  it('creates both partial indexes on fuxa_views', () => {
    const db = applyAll();
    const idx = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='fuxa_views' ORDER BY name`)
      .all() as Array<{ name: string }>;
    const names = idx.map((r) => r.name);
    // sqlite_autoindex_* is the PK; we expect our 2 explicit indexes.
    expect(names).toContain('idx_fuxa_views_template');
    expect(names).toContain('idx_fuxa_views_parent');
  });

  it('parent_view_id ON DELETE SET NULL cascade works', () => {
    const db = applyAll();
    db.exec(`PRAGMA foreign_keys = ON`);
    db.prepare(
      `INSERT INTO fuxa_views (id, name, type, payload, width, height) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('parent', 'Parent', 'svg', '{}', 800, 600);
    db.prepare(
      `INSERT INTO fuxa_views (id, name, type, payload, width, height, parent_view_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('child', 'Child', 'svg', '{}', 800, 600, 'parent');
    db.prepare(`DELETE FROM fuxa_views WHERE id = 'parent'`).run();
    const row = db.prepare(`SELECT parent_view_id FROM fuxa_views WHERE id = 'child'`).get() as { parent_view_id: string | null };
    expect(row.parent_view_id).toBeNull();
  });
});
