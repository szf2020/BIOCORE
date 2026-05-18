// ============================================================
// 036-scada-views-svgcontent.test.ts — SP-FX-34 KI-3 TDD RED-first
// 验证 migration 036 给 scada_views 加 svgcontent TEXT NOT NULL DEFAULT ''
// ============================================================
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(__dirname, '../../../migrations');

function readSql(filename: string): string {
  return readFileSync(join(MIGRATIONS_DIR, filename), 'utf8');
}

// 依序执行 scada_views 所需的基础 migrations，再跑 036
function buildDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(readSql('028-scada-schema.sql'));
  db.exec(readSql('030-scada-view-svg-flag.sql'));
  db.exec(readSql('031-scada-view-template-flag.sql'));
  db.exec(readSql('035-view-acl.sql'));
  db.exec(readSql('036-scada-views-svgcontent.sql'));
  return db;
}

describe('migration 036-scada-views-svgcontent (KI-3 SP-FX-34)', () => {
  it('scada_views 包含 svgcontent 列，类型 TEXT', () => {
    const db = buildDb();
    const cols = db.prepare(`PRAGMA table_info(scada_views)`).all() as Array<{
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
    }>;
    const svgCol = cols.find((c) => c.name === 'svgcontent');
    expect(svgCol).toBeDefined();
    expect(svgCol!.type.toUpperCase()).toBe('TEXT');
  });

  it('svgcontent 默认值为空字符串', () => {
    const db = buildDb();
    const cols = db.prepare(`PRAGMA table_info(scada_views)`).all() as Array<{
      name: string;
      dflt_value: string | null;
    }>;
    const svgCol = cols.find((c) => c.name === 'svgcontent');
    // SQLite 对 DEFAULT '' 的 dflt_value 返回 "''"
    expect(svgCol!.dflt_value).toBe("''");
  });

  it('旧格式行插入（无 svgcontent）成功，读回 svgcontent = ""', () => {
    const db = buildDb();
    db.prepare(`INSERT INTO scada_projects (project_id, name) VALUES (?, ?)`).run('proj1', 'Test');
    db.prepare(
      `INSERT INTO scada_views (view_id, project_id, name) VALUES (?, ?, ?)`,
    ).run('view1', 'proj1', 'View One');
    const row = db.prepare(`SELECT svgcontent FROM scada_views WHERE view_id = ?`).get('view1') as {
      svgcontent: string;
    };
    expect(row.svgcontent).toBe('');
  });

  it('含 svgcontent 的新行插入并读回正确值', () => {
    const db = buildDb();
    const svg = '<rect x="0" y="0" width="100" height="100" fill="blue"/>';
    db.prepare(`INSERT INTO scada_projects (project_id, name) VALUES (?, ?)`).run('proj2', 'Test2');
    db.prepare(
      `INSERT INTO scada_views (view_id, project_id, name, svgcontent) VALUES (?, ?, ?, ?)`,
    ).run('view2', 'proj2', 'View Two', svg);
    const row = db.prepare(`SELECT svgcontent FROM scada_views WHERE view_id = ?`).get('view2') as {
      svgcontent: string;
    };
    expect(row.svgcontent).toBe(svg);
  });

  it('migration 036 不破坏已有列（view_id, name, is_svg, is_template, owner_id, acl）', () => {
    const db = buildDb();
    const cols = db.prepare(`PRAGMA table_info(scada_views)`).all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain('view_id');
    expect(names).toContain('name');
    expect(names).toContain('is_svg');
    expect(names).toContain('is_template');
    expect(names).toContain('owner_id');
    expect(names).toContain('acl');
    expect(names).toContain('svgcontent');
  });
});
