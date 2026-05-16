import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function applyAll(db: Database.Database): void {
  db.exec(readFileSync(join(__dirname, '../../../migrations/028-scada-schema.sql'), 'utf8'));
  db.exec(readFileSync(join(__dirname, '../../../migrations/030-scada-view-svg-flag.sql'), 'utf8'));
  db.exec(readFileSync(join(__dirname, '../../../migrations/031-scada-view-template-flag.sql'), 'utf8'));
}

describe('migration 031 — scada_views.is_template', () => {
  it('adds is_template column with default 0', () => {
    const db = new Database(':memory:');
    applyAll(db);
    const cols = db.prepare("PRAGMA table_info(scada_views)").all() as Array<{ name: string; dflt_value: string | null }>;
    const col = cols.find(c => c.name === 'is_template');
    expect(col).toBeDefined();
    expect(col!.dflt_value).toBe('0');
  });

  it('creates partial index idx_scada_views_template', () => {
    const db = new Database(':memory:');
    applyAll(db);
    const idx = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND name='idx_scada_views_template'").get() as { name: string; sql: string } | undefined;
    expect(idx).toBeDefined();
    expect(idx!.sql).toMatch(/is_template/);
  });
});
