#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

interface Decision {
  decision: 'keep' | 'drop';
  name?: string;
  reactor_id?: string | null;
  project_id?: string;
}

const decisionsPath =
  process.argv[2] ?? '/Volumes/SSD/BIOCORE/migration-output/decisions.json';
const outDir = process.argv[3] ?? '/Volumes/SSD/BIOCORE/migration-output';
const targetDb = process.argv[4] ?? '/Volumes/SSD/BIOCORE/packages/server/data/biocore.db';

const decisions: Record<string, Decision> = JSON.parse(readFileSync(decisionsPath, 'utf8'));
const db = new Database(targetDb);

const defaultProject = 'fuxa-migration';
const existing = db.prepare('SELECT 1 FROM scada_projects WHERE project_id = ?').get(defaultProject);
if (!existing) {
  db.prepare(`INSERT INTO scada_projects (project_id, name, description) VALUES (?, ?, ?)`).run(
    defaultProject,
    'FUXA Migration',
    'Auto-imported from FUXA project.fuxap.db on 2026-05-16',
  );
}

let kept = 0;
let dropped = 0;
for (const [viewId, d] of Object.entries(decisions)) {
  if (d.decision === 'drop') {
    dropped++;
    continue;
  }
  const json = JSON.parse(readFileSync(join(outDir, `${viewId}.json`), 'utf8'));
  const projectId = d.project_id ?? defaultProject;
  const name = d.name ?? viewId;
  const exists = db.prepare('SELECT 1 FROM scada_views WHERE view_id = ?').get(viewId);
  if (exists) {
    db.prepare(
      `UPDATE scada_views SET items_json = ?, name = ?, reactor_id = ?, width = ?, height = ?, background = ?, is_svg = 1, updated_at = datetime('now') WHERE view_id = ?`,
    ).run(
      JSON.stringify(json),
      name,
      d.reactor_id ?? null,
      json.width,
      json.height,
      json.background,
      viewId,
    );
  } else {
    db.prepare(
      `INSERT INTO scada_views (view_id, project_id, name, reactor_id, display_order, width, height, background, items_json, is_svg, is_template) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, 1, 0)`,
    ).run(
      viewId,
      projectId,
      name,
      d.reactor_id ?? null,
      json.width,
      json.height,
      json.background,
      JSON.stringify(json),
    );
  }
  kept++;
}
console.log(`published ${kept} views (dropped ${dropped})`);
