#!/usr/bin/env tsx
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { FUXA_TO_BIOCORE_TYPE } from './fuxa-type-map';

interface FuxaItem {
  id: string;
  type: string;
  name?: string;
  label?: string;
  property?: Record<string, unknown> & { variableId?: string; actions?: unknown[] };
}

interface FuxaView {
  id: string;
  name: string;
  profile?: { width?: number; height?: number; bkcolor?: string; margin?: number };
  items?: Record<string, FuxaItem>;
}

interface BiocoreWidget {
  id: string; type: string;
  x: number; y: number; w: number; h: number;
  props?: Record<string, unknown>;
  bindings?: { tag?: string };
}

interface BiocoreView {
  width: number;
  height: number;
  background?: string;
  items: BiocoreWidget[];
}

export interface ConvertReport {
  fuxaViewId: string;
  fuxaName: string;
  widgetCount: number;
  unknownTypes: string[];
  lossy: string[];
}

export interface ConvertResult {
  view: BiocoreView;
  report: ConvertReport;
}

function stripAlpha(color?: string): string | undefined {
  if (!color) return undefined;
  return color.length === 9 && color.startsWith('#') ? color.slice(0, 7) : color;
}

function mapType(fuxaType: string, report: ConvertReport): string {
  const t = FUXA_TO_BIOCORE_TYPE[fuxaType];
  if (t) return t;
  if (!report.unknownTypes.includes(fuxaType)) report.unknownTypes.push(fuxaType);
  return 'svg-rect';
}

function gridPlacement(index: number, total: number, vw: number, vh: number): { x: number; y: number; w: number; h: number } {
  const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
  const rows = Math.ceil(total / cols);
  const cellW = Math.floor(vw / cols);
  const cellH = Math.floor(vh / rows);
  const col = index % cols;
  const row = Math.floor(index / cols);
  const pad = 4;
  return {
    x: col * cellW + pad,
    y: row * cellH + pad,
    w: Math.max(20, cellW - 2 * pad),
    h: Math.max(20, cellH - 2 * pad),
  };
}

export function convertFuxaView(fuxa: FuxaView): ConvertResult {
  const width = fuxa.profile?.width ?? 1280;
  const height = fuxa.profile?.height ?? 720;
  const background = stripAlpha(fuxa.profile?.bkcolor) ?? '#ffffff';

  const report: ConvertReport = {
    fuxaViewId: fuxa.id,
    fuxaName: fuxa.name,
    widgetCount: 0,
    unknownTypes: [],
    lossy: [],
  };

  const rawItems = Object.values(fuxa.items ?? {});
  const items: BiocoreWidget[] = rawItems.map((src, i) => {
    const placement = gridPlacement(i, rawItems.length, width, height);
    const w: BiocoreWidget = {
      id: src.id,
      type: mapType(src.type, report),
      x: placement.x,
      y: placement.y,
      w: placement.w,
      h: placement.h,
    };
    const variableId = src.property?.variableId;
    if (typeof variableId === 'string' && variableId.length > 0) {
      w.bindings = { tag: variableId };
    }
    if (src.label) {
      w.props = { ...(w.props ?? {}), text: src.label };
    }
    const actions = src.property?.actions;
    if (Array.isArray(actions) && actions.length > 1) {
      report.lossy.push(
        `widget ${src.id}: multi-action dropped (${actions.length} actions, only first considered)`,
      );
    }
    return w;
  });

  report.widgetCount = items.length;

  return { view: { width, height, background, items }, report };
}

const isMain =
  typeof process !== 'undefined' &&
  !!process.argv?.[1] &&
  /fuxa-import(\.ts|\.js)?$/.test(process.argv[1]);

if (isMain) {
  const sourceDb = process.argv[2] ?? '/Volumes/SSD/BIOCORE/fuxa/appdata/project.fuxap.db';
  const outDir = process.argv[3] ?? '/Volumes/SSD/BIOCORE/migration-output';
  mkdirSync(outDir, { recursive: true });

  const db = new Database(sourceDb, { readonly: true });
  const rows = db
    .prepare('SELECT name AS view_id, value AS json_text FROM views')
    .all() as Array<{ view_id: string; json_text: string }>;

  const indexReport: Array<{ view_id: string; report: ConvertReport }> = [];
  for (const row of rows) {
    let fuxa: FuxaView;
    try {
      fuxa = JSON.parse(row.json_text);
    } catch {
      console.error(`skip ${row.view_id}: parse error`);
      continue;
    }
    const { view, report } = convertFuxaView(fuxa);
    writeFileSync(join(outDir, `${row.view_id}.json`), JSON.stringify(view, null, 2));
    writeFileSync(
      join(outDir, `${row.view_id}.report.txt`),
      [
        `FUXA view_id: ${report.fuxaViewId}`,
        `FUXA display name: ${report.fuxaName}`,
        `Widget count: ${report.widgetCount}`,
        `Unknown types: ${report.unknownTypes.length ? report.unknownTypes.join(', ') : '(none)'}`,
        `Lossy notes:`,
        ...(report.lossy.length ? report.lossy.map((s) => `  - ${s}`) : ['  (none)']),
        ``,
        `IMPORTANT: x/y/w/h are grid-layout fallbacks. Open in /scada2/edit/<viewId> and reposition manually.`,
      ].join('\n'),
    );
    indexReport.push({ view_id: row.view_id, report });
  }
  writeFileSync(join(outDir, '_index.json'), JSON.stringify(indexReport, null, 2));
  console.log(`wrote ${indexReport.length} views to ${outDir}/`);
}
