# SP7.5 FUXA Decommission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Halt gates marked HALT must NOT be skipped.

**Goal:** Execute the 4-phase FUXA decommission per the SP7 audit, with user-approved decisions:
- View migration: auto-convert script + per-view human review
- FUXA access pattern: embedded-iframe only (no direct `/fuxa/` URLs)
- Soak period: 7 days
- FUXA alarms: drop (use BIOCORE alarms)

**Branch:** `feat/scada-data-model` → `main`

**Audit reference:** `docs/superpowers/specs/2026-05-16-fuxa-decommission-audit.md` (commit `97122a3`)

**13 FUXA views to migrate:**

| view_id | display name | size |
|---|---|---|
| v_12121374898-71096 | CM_AI | 336x386 |
| v_98694595-35510 | CM_Motor | 336x386 |
| v_b6554bb8-32120 | CM_Valve | 336x386 |
| v_91994397-708a | Maint | 1280x960 |
| v_24511411913-13b82 | Para | 1024x768 |
| v_10412541aa-12a31 | RecipeManger | 1280x690 |
| v_16254bb2-a6713 | Report | 1024x768 |
| v_010121349ab-312a1 | Tank_1000L | 1900x980 |
| v_8118b42a2-345b | Tank_500L | 1600x900 |
| v_11b4114699-b345 | Tank_50L | 1600x900 |
| v_1a10a4a99-2133 | Trend | 1024x768 |
| v_313a749b1-1b91 | View_1 | 336x386 |
| v_0712346b1-12b1210 | MainView | 1600x900 |

---

## Phase 0 — Backup (T1)

## Task 1: Create `fuxa-archive-2026-05-16.tar.gz`

- [ ] **Step 1: Build archive**

```bash
cd /Volumes/SSD/BIOCORE
mkdir -p fuxa-archive-2026-05-16/{appdata,logs,server,scripts}
cp -a fuxa/appdata/. fuxa-archive-2026-05-16/appdata/
cp -aL fuxa/logs/. fuxa-archive-2026-05-16/logs/ 2>/dev/null || cp -a fuxa/logs/. fuxa-archive-2026-05-16/logs/
cp -a packages/fuxa/server fuxa-archive-2026-05-16/server/
cp -a scripts/fuxa-patches fuxa-archive-2026-05-16/scripts/ 2>/dev/null || true
cp packages/server/data/biocore.db fuxa-archive-2026-05-16/biocore-before-migration.db
tar -czf fuxa-archive-2026-05-16.tar.gz fuxa-archive-2026-05-16/
ls -lh fuxa-archive-2026-05-16.tar.gz
```

- [ ] **Step 2: Verify + checksum**

```bash
tar -tzf fuxa-archive-2026-05-16.tar.gz | head -20
sha256sum fuxa-archive-2026-05-16.tar.gz > fuxa-archive-2026-05-16.tar.gz.sha256
cat fuxa-archive-2026-05-16.tar.gz.sha256
```

- [ ] **Step 3: Gitignore + commit checksum only**

```bash
cd /Volumes/SSD/BIOCORE
grep -q "^fuxa-archive-2026-05-16/$" .gitignore || echo "fuxa-archive-2026-05-16/" >> .gitignore
grep -q "^fuxa-archive-2026-05-16.tar.gz$" .gitignore || echo "fuxa-archive-2026-05-16.tar.gz" >> .gitignore
git add .gitignore fuxa-archive-2026-05-16.tar.gz.sha256
git commit -m "chore(fuxa-decom): Phase 0 backup checksum (archive built locally, gitignored)"
```

**HALT-0:** Confirm `fuxa-archive-2026-05-16.tar.gz` exists locally and has been moved/copied off the dev machine to long-term backup before proceeding.

---

## Phase 1 — Apply migration 031 to production (T2)

## Task 2: Apply migration 031 to `packages/server/data/biocore.db`

- [ ] **Step 1: Schema before**

```bash
sqlite3 /Volumes/SSD/BIOCORE/packages/server/data/biocore.db "PRAGMA table_info(scada_views);" | head -15
```

- [ ] **Step 2: Apply**

```bash
cd /Volumes/SSD/BIOCORE/packages/server
node --input-type=module -e "
import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
const db = new Database('data/biocore.db');
const sql = readFileSync('migrations/031-scada-view-template-flag.sql', 'utf8');
db.exec(sql);
console.log('migration 031 applied to data/biocore.db');
"
```

- [ ] **Step 3: Verify after**

```bash
sqlite3 /Volumes/SSD/BIOCORE/packages/server/data/biocore.db "PRAGMA table_info(scada_views);" | grep is_template
sqlite3 /Volumes/SSD/BIOCORE/packages/server/data/biocore.db "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_scada_views_template';"
sqlite3 /Volumes/SSD/BIOCORE/packages/server/data/biocore.db "SELECT view_id, name, is_template FROM scada_views;"
```

Both queries must return rows; existing 2 rows must show `is_template=0`.

**HALT-1:** Verify prod server still reads/writes `scada_views`.

---

## Phase 2 — Auto-convert + per-view review (T3–T5)

## Task 3: Build `scripts/fuxa-import.ts` with vitest

- [ ] **Step 1: Failing tests**

Create `scripts/__tests__/fuxa-import.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { convertFuxaView } from '../fuxa-import';

describe('convertFuxaView', () => {
  it('maps profile.width/height/bkcolor to top-level SvgViewJson', () => {
    const fuxa = { id: 'v_test', name: 'Test',
      profile: { width: 800, height: 600, bkcolor: '#222', margin: 0 }, items: {} };
    const r = convertFuxaView(fuxa);
    expect(r.view.width).toBe(800);
    expect(r.view.height).toBe(600);
    expect(r.view.background).toBe('#222');
    expect(r.view.items).toEqual([]);
  });

  it('drops # alpha channel from background', () => {
    const fuxa = { id: 'x', name: 'X', profile: { width: 100, height: 100, bkcolor: '#e7e7e7ff', margin: 0 }, items: {} };
    expect(convertFuxaView(fuxa).view.background).toBe('#e7e7e7');
  });

  it('converts items Record to array with widget ids preserved', () => {
    const fuxa = { id: 'v', name: 'V', profile: { width: 100, height: 100, bkcolor: '#fff', margin: 0 },
      items: {
        a: { id: 'a', type: 'svg-ext-value', property: {}, name: 'a', label: 'L' },
        b: { id: 'b', type: 'svg-ext-value', property: {}, name: 'b', label: 'L' },
      } };
    const r = convertFuxaView(fuxa);
    expect(r.view.items.map(it => it.id).sort()).toEqual(['a', 'b']);
  });

  it('maps known fuxa types via registry; unknown types fall back to svg-rect', () => {
    const fuxa = { id: 'v', name: 'V', profile: { width: 100, height: 100, bkcolor: '#fff', margin: 0 },
      items: {
        a: { id: 'a', type: 'svg-ext-value', property: {}, name: 'a', label: 'L' },
        u: { id: 'u', type: 'HXT_UnknownThing', property: {}, name: 'u', label: 'L' },
      } };
    const r = convertFuxaView(fuxa);
    expect(r.view.items.find(it => it.id === 'a')!.type).toBe('svg-label');
    expect(r.view.items.find(it => it.id === 'u')!.type).toBe('svg-rect');
    expect(r.report.unknownTypes).toContain('HXT_UnknownThing');
  });

  it('extracts variableId → bindings.tag when present', () => {
    const fuxa = { id: 'v', name: 'V', profile: { width: 100, height: 100, bkcolor: '#fff', margin: 0 },
      items: { a: { id: 'a', type: 'svg-ext-value', property: { variableId: 't_7e06_xyz' }, name: 'a', label: 'L' } } };
    expect(convertFuxaView(fuxa).view.items[0].bindings).toEqual({ tag: 't_7e06_xyz' });
  });

  it('assigns grid placement when no x/y/w/h available', () => {
    const fuxa = { id: 'v', name: 'V', profile: { width: 400, height: 400, bkcolor: '#fff', margin: 0 },
      items: {
        a: { id: 'a', type: 'svg-ext-value', property: {}, name: 'a', label: 'L' },
        b: { id: 'b', type: 'svg-ext-value', property: {}, name: 'b', label: 'L' },
        c: { id: 'c', type: 'svg-ext-value', property: {}, name: 'c', label: 'L' },
      } };
    const all = convertFuxaView(fuxa).view.items;
    expect(all.every(it => typeof it.x === 'number' && typeof it.y === 'number' && it.w > 0 && it.h > 0)).toBe(true);
  });

  it('reports dropped multi-actions', () => {
    const fuxa = { id: 'v', name: 'V', profile: { width: 100, height: 100, bkcolor: '#fff', margin: 0 },
      items: { b: { id: 'b', type: 'svg-ext-value', name: 'b', label: 'L',
        property: { actions: [{ type: 'write', tag: 't1', value: 1 }, { type: 'navigate', view_id: 'v2' }] } } } };
    const r = convertFuxaView(fuxa);
    expect(r.report.lossy.length).toBeGreaterThan(0);
    expect(r.report.lossy[0]).toMatch(/multi-action/);
  });
});
```

- [ ] **Step 2: RED**

```bash
cd /Volumes/SSD/BIOCORE
export PATH="/Users/mac/.hermes/node/bin:$PATH"
npx vitest run scripts/__tests__/fuxa-import.test.ts 2>&1 | tail -20
```

- [ ] **Step 3: Type registry**

Create `scripts/fuxa-type-map.ts`:

```typescript
export const FUXA_TO_BIOCORE_TYPE: Record<string, string> = {
  'svg-ext-value': 'svg-label',
  'svg-ext-text': 'svg-label',
  'svg-ext-html_button': 'svg-button',
  'svg-ext-html_switch': 'svg-switch',
  'svg-ext-html_input': 'svg-input',
  'svg-ext-html_select': 'svg-select',
  'svg-ext-html_slider': 'svg-slider',
  'svg-ext-html_image': 'svg-image',
  'svg-ext-html_chart': 'svg-chart',
  'HXT_TANK': 'svg-tank',
  'HXT_PUMP': 'svg-pump',
  'HXT_VALVE': 'svg-valve',
  'HXT_MOTOR': 'svg-motor',
  'HXT_HEATER': 'svg-heater',
  'HXT_REACTOR': 'svg-reactor',
  'HXT_SENSOR': 'svg-sensor',
  'HXT_PROBE': 'svg-probe',
  'HXT_STIRRER': 'svg-stirrer',
  'HXT_SPARGER': 'svg-sparger',
  'HXT_PIPE': 'svg-pipe',
  'HXT_LAMP': 'svg-lamp',
  'HXT_INDICATOR': 'svg-indicator',
  'HXT_GAUGE': 'svg-gauge',
};
```

- [ ] **Step 4: Importer**

Create `scripts/fuxa-import.ts`:

```typescript
#!/usr/bin/env tsx
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { FUXA_TO_BIOCORE_TYPE } from './fuxa-type-map';

interface FuxaItem {
  id: string; type: string;
  name?: string; label?: string;
  property?: Record<string, unknown> & { variableId?: string; actions?: unknown[] };
}

interface FuxaView {
  id: string; name: string;
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
  width: number; height: number; background?: string;
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
  return { x: col * cellW + pad, y: row * cellH + pad, w: Math.max(20, cellW - 2 * pad), h: Math.max(20, cellH - 2 * pad) };
}

export function convertFuxaView(fuxa: FuxaView): ConvertResult {
  const width = fuxa.profile?.width ?? 1280;
  const height = fuxa.profile?.height ?? 720;
  const background = stripAlpha(fuxa.profile?.bkcolor) ?? '#ffffff';
  const report: ConvertReport = { fuxaViewId: fuxa.id, fuxaName: fuxa.name, widgetCount: 0, unknownTypes: [], lossy: [] };
  const rawItems = Object.values(fuxa.items ?? {});
  const items: BiocoreWidget[] = rawItems.map((src, i) => {
    const placement = gridPlacement(i, rawItems.length, width, height);
    const w: BiocoreWidget = {
      id: src.id, type: mapType(src.type, report),
      x: placement.x, y: placement.y, w: placement.w, h: placement.h,
    };
    const variableId = src.property?.variableId;
    if (typeof variableId === 'string' && variableId.length > 0) w.bindings = { tag: variableId };
    if (src.label) w.props = { ...(w.props ?? {}), text: src.label };
    const actions = src.property?.actions;
    if (Array.isArray(actions) && actions.length > 1) {
      report.lossy.push(`widget ${src.id}: multi-action dropped (${actions.length} actions, only first considered)`);
    }
    return w;
  });
  report.widgetCount = items.length;
  return { view: { width, height, background, items }, report };
}

const isMain = typeof process !== 'undefined' && (process.argv?.[1]?.endsWith('fuxa-import.ts') || process.argv?.[1]?.endsWith('fuxa-import'));
if (isMain) {
  const sourceDb = process.argv[2] ?? '/Volumes/SSD/BIOCORE/fuxa/appdata/project.fuxap.db';
  const outDir = process.argv[3] ?? '/Volumes/SSD/BIOCORE/migration-output';
  mkdirSync(outDir, { recursive: true });
  const db = new Database(sourceDb, { readonly: true });
  const rows = db.prepare('SELECT name AS view_id, value AS json_text FROM views').all() as Array<{ view_id: string; json_text: string }>;
  const indexReport: Array<{ view_id: string; report: ConvertReport }> = [];
  for (const row of rows) {
    let fuxa: FuxaView;
    try { fuxa = JSON.parse(row.json_text); }
    catch { console.error(`skip ${row.view_id}: parse error`); continue; }
    const { view, report } = convertFuxaView(fuxa);
    writeFileSync(join(outDir, `${row.view_id}.json`), JSON.stringify(view, null, 2));
    writeFileSync(join(outDir, `${row.view_id}.report.txt`), [
      `FUXA view_id: ${report.fuxaViewId}`,
      `FUXA display name: ${report.fuxaName}`,
      `Widget count: ${report.widgetCount}`,
      `Unknown types: ${report.unknownTypes.length ? report.unknownTypes.join(', ') : '(none)'}`,
      `Lossy notes:`, ...(report.lossy.length ? report.lossy.map(s => `  - ${s}`) : ['  (none)']),
      ``,
      `IMPORTANT: x/y/w/h are grid-layout fallbacks. Open in /scada2/edit/<viewId> and reposition manually.`,
    ].join('\n'));
    indexReport.push({ view_id: row.view_id, report });
  }
  writeFileSync(join(outDir, '_index.json'), JSON.stringify(indexReport, null, 2));
  console.log(`wrote ${indexReport.length} views to ${outDir}/`);
}
```

- [ ] **Step 5: GREEN**

```bash
cd /Volumes/SSD/BIOCORE
export PATH="/Users/mac/.hermes/node/bin:$PATH"
npx vitest run scripts/__tests__/fuxa-import.test.ts 2>&1 | tail -10
```

Expected: `7 passed`.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add scripts/fuxa-import.ts scripts/fuxa-type-map.ts scripts/__tests__/fuxa-import.test.ts
git commit -m "feat(fuxa-decom): scripts/fuxa-import.ts auto-converter (+7 tests)"
```

---

## Task 4: Run auto-convert on 13 production views

- [ ] **Step 1: Run**

```bash
cd /Volumes/SSD/BIOCORE
export PATH="/Users/mac/.hermes/node/bin:$PATH"
mkdir -p migration-output
npx tsx scripts/fuxa-import.ts fuxa/appdata/project.fuxap.db migration-output
ls migration-output/ | head -30
```

Expected: 13 `.json` files + 13 `.report.txt` files + `_index.json`.

- [ ] **Step 2: Print reports**

```bash
for f in migration-output/v_*.report.txt; do echo "=== $f ==="; cat "$f"; done
```

- [ ] **Step 3: Gitignore output**

```bash
cd /Volumes/SSD/BIOCORE
grep -q "^migration-output/$" .gitignore || echo "migration-output/" >> .gitignore
git add .gitignore
git commit -m "chore(fuxa-decom): gitignore migration-output/ (T4 artifacts, large + transient)"
```

**HALT-2:** User reads `migration-output/*.report.txt` and decides per view: keep / drop / manual-rebuild-before-import. Writes `migration-output/decisions.json`.

---

## Task 5: Build `scripts/fuxa-publish.ts` (commit only; DO NOT execute)

- [ ] **Step 1: Script**

Create `scripts/fuxa-publish.ts`:

```typescript
#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

interface Decision { decision: 'keep' | 'drop'; name?: string; reactor_id?: string | null; project_id?: string }

const decisionsPath = process.argv[2] ?? '/Volumes/SSD/BIOCORE/migration-output/decisions.json';
const outDir = process.argv[3] ?? '/Volumes/SSD/BIOCORE/migration-output';
const targetDb = process.argv[4] ?? '/Volumes/SSD/BIOCORE/packages/server/data/biocore.db';

const decisions: Record<string, Decision> = JSON.parse(readFileSync(decisionsPath, 'utf8'));
const db = new Database(targetDb);

const defaultProject = 'fuxa-migration';
const existing = db.prepare('SELECT 1 FROM scada_projects WHERE project_id = ?').get(defaultProject);
if (!existing) {
  db.prepare(`INSERT INTO scada_projects (project_id, name, description) VALUES (?, ?, ?)`)
    .run(defaultProject, 'FUXA Migration', 'Auto-imported from FUXA project.fuxap.db on 2026-05-16');
}

let kept = 0; let dropped = 0;
for (const [viewId, d] of Object.entries(decisions)) {
  if (d.decision === 'drop') { dropped++; continue; }
  const json = JSON.parse(readFileSync(join(outDir, `${viewId}.json`), 'utf8'));
  const projectId = d.project_id ?? defaultProject;
  const name = d.name ?? viewId;
  const exists = db.prepare('SELECT 1 FROM scada_views WHERE view_id = ?').get(viewId);
  if (exists) {
    db.prepare(`UPDATE scada_views SET items_json = ?, name = ?, reactor_id = ?, width = ?, height = ?, background = ?, is_svg = 1, updated_at = datetime('now') WHERE view_id = ?`)
      .run(JSON.stringify(json), name, d.reactor_id ?? null, json.width, json.height, json.background, viewId);
  } else {
    db.prepare(`INSERT INTO scada_views (view_id, project_id, name, reactor_id, display_order, width, height, background, items_json, is_svg, is_template) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, 1, 0)`)
      .run(viewId, projectId, name, d.reactor_id ?? null, json.width, json.height, json.background, JSON.stringify(json));
  }
  kept++;
}
console.log(`published ${kept} views (dropped ${dropped})`);
```

- [ ] **Step 2: Commit script (DO NOT run)**

```bash
cd /Volumes/SSD/BIOCORE
git add scripts/fuxa-publish.ts
git commit -m "feat(fuxa-decom): scripts/fuxa-publish.ts (apply decisions to scada_views)"
```

**HALT-3:** User writes `migration-output/decisions.json` then runs:

```bash
cd /Volumes/SSD/BIOCORE
npx tsx scripts/fuxa-publish.ts
```

Destructive write to prod `biocore.db`.

---

## Phase 3 — Soak (T6 + T7 wait gate)

## Task 6: nginx flip `/fuxa/` → `/scada2`

- [ ] **Step 1: Locate**

```bash
grep -n "/fuxa/\|fuxaserver\|host.docker.internal:1881" /Volumes/SSD/BIOCORE/nginx/nginx.conf
```

- [ ] **Step 2: Replace proxy_pass with 301**

Replace the `location /fuxa/ { proxy_pass ... }` block with:

```nginx
location /fuxa/ {
  # SP7.5 soak: 2026-05-16 → 2026-05-23 (7 days)
  return 301 /scada2;
}

location ~ ^/fuxa(.*)$ {
  return 301 /scada2$1;
}
```

- [ ] **Step 3: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add nginx/nginx.conf
git commit -m "chore(fuxa-decom): Phase 3 nginx 301 /fuxa/ → /scada2 (soak starts 2026-05-16)"
```

- [ ] **Step 4: Reload nginx (user runs)**

User runs `docker compose restart nginx` or `sudo nginx -s reload`. Not auto-executed.

---

## Task 7: SOAK GATE — DO NOT PROCEED BEFORE 2026-05-23

- [ ] Confirm date ≥ 2026-05-23
- [ ] Verify nginx access log shows ~0 `/fuxa/` traffic

When the gate passes, proceed to T8.

---

## Phase 4 — Decommission (T8–T13, blocked until HALT-4 passes)

## Task 8: Delete frontend legacy

- [ ] **Step 1: Verify no production imports**

```bash
cd /Volumes/SSD/BIOCORE
grep -rln "from '@/components/scada/WidgetView\|from '@/components/scada/ViewActionRouter\|from '@/components/scada/WriteIntentDialog'\|from '@/app/scada/" packages/web-ui/src --include="*.tsx" --include="*.ts" | grep -v __tests__ | grep -v "scada/runtime"
```

Expected: only the legacy tree references these. Runtime new dialog at `scada/runtime/` unaffected.

- [ ] **Step 2: Delete**

```bash
cd /Volumes/SSD/BIOCORE
git rm -r packages/web-ui/src/app/scada
git rm packages/web-ui/src/components/scada/WidgetView.tsx packages/web-ui/src/components/scada/__tests__/WidgetView.test.tsx
git rm packages/web-ui/src/components/scada/ViewActionRouter.tsx packages/web-ui/src/components/scada/__tests__/ViewActionRouter.test.tsx
git rm packages/web-ui/src/components/scada/WriteIntentDialog.tsx packages/web-ui/src/components/scada/__tests__/WriteIntentDialog.test.tsx
```

- [ ] **Step 3: TSC + tests**

```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
export PATH="/Users/mac/.hermes/node/bin:$PATH"
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -10
pnpm test 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git commit -m "chore(fuxa-decom): Phase 4.1 delete frontend legacy (app/scada/, WidgetView, ViewActionRouter, legacy WriteIntentDialog)"
```

---

## Task 9: Delete backend FUXA bridge

- [ ] **Step 1: Locate refs**

```bash
grep -n "fuxa\|FuxaUserSync\|FUXA" /Volumes/SSD/BIOCORE/packages/server/src/index.ts
grep -n "FUXA\|fuxa" /Volumes/SSD/BIOCORE/packages/server/src/auth-routes.ts
```

- [ ] **Step 2: Edit `index.ts`**

Remove `createFuxaUserSync` import (~line 31), `FuxaUserSync` type, init block (~lines 672–675), teardown.

- [ ] **Step 3: Edit `auth-routes.ts`**

Line 111: if cookie only serves FUXA `auth_request`, delete cookie code. If broader use, update comment only.

- [ ] **Step 4: Delete sync file**

```bash
cd /Volumes/SSD/BIOCORE
git rm packages/server/src/fuxa-user-sync.ts
```

- [ ] **Step 5: TSC + tests**

```bash
cd /Volumes/SSD/BIOCORE/packages/server
export PATH="/Users/mac/.hermes/node/bin:$PATH"
pnpm exec tsc --noEmit 2>&1 | tail -10
pnpm test 2>&1 | tail -10
```

- [ ] **Step 6: MQTT comment cleanup**

Edit `packages/server/src/mqtt-publisher.ts` lines 3, 60: replace "FUXA" wording with "external subscribers".
Edit `packages/server/src/mqtt-subscriber.ts` similarly.

- [ ] **Step 7: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/server/src/{index.ts,auth-routes.ts,mqtt-publisher.ts,mqtt-subscriber.ts}
git commit -m "chore(fuxa-decom): Phase 4.2 delete fuxa-user-sync + clean FUXA references in server"
```

---

## Task 10: Delete `packages/fuxa/`, `fuxa/`, `scripts/fuxa-patches/`

**HALT-5:** User confirms `fuxa-archive-2026-05-16.tar.gz` is off-machine before proceeding.

- [ ] **Step 1: Delete**

```bash
cd /Volumes/SSD/BIOCORE
git rm -r packages/fuxa
git rm -r fuxa
git rm -r scripts/fuxa-patches 2>/dev/null || true
```

- [ ] **Step 2: Commit**

```bash
git commit -m "chore(fuxa-decom): Phase 4.3 delete packages/fuxa (241 MB) + fuxa/ runtime data (archived 2026-05-16)"
```

---

## Task 11: nginx + docker compose + grafana cleanup

- [ ] **Step 1: Remove nginx 301 block**

Delete both `location /fuxa/` and `location ~ ^/fuxa(.*)$` blocks from `nginx/nginx.conf` (added T6).

- [ ] **Step 2: Edit docker-compose.yml**

Remove FUXA bridge comments + any related env vars.

- [ ] **Step 3: Delete grafana dashboard**

```bash
cd /Volumes/SSD/BIOCORE
git rm observability/grafana/dashboards/biocore-fuxa-integration.json
```

- [ ] **Step 4: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add nginx/nginx.conf docker-compose.yml
git commit -m "chore(fuxa-decom): Phase 4.4 nginx + docker-compose + grafana cleanup"
```

---

## Task 12: Update navigation + final tsc + regression

- [ ] **Step 1: Find legacy links**

```bash
cd /Volumes/SSD/BIOCORE
grep -rln "'/scada\b\|\"/scada\b" packages/web-ui/src --include="*.tsx" | grep -v "/scada2\b" | head -10
```

- [ ] **Step 2: Update to `/scada2`**

Manual per file.

- [ ] **Step 3: Regression**

```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
export PATH="/Users/mac/.hermes/node/bin:$PATH"
pnpm test 2>&1 | tail -10
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -10
cd /Volumes/SSD/BIOCORE/packages/server
pnpm test 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add -A
git commit -m "chore(fuxa-decom): Phase 4.5 update navigation + final cleanup"
```

---

## Task 13: Push + FF-merge

```bash
cd /Volumes/SSD/BIOCORE
git push origin feat/scada-data-model 2>&1 | tail -5
git checkout main
git fetch origin main 2>&1 | tail -3
git merge --ff-only feat/scada-data-model 2>&1 | tail -3
git push origin main 2>&1 | tail -3
git checkout feat/scada-data-model
```

---

## Done criteria

- Phase 0: archive built + checksummed
- Phase 1: migration 031 applied to prod
- Phase 2: 13 views auto-converted; user-approved subset published
- Phase 3: 7-day soak (HALT)
- Phase 4 (post-soak): legacy frontend + backend bridge + packages/fuxa + nginx + docker + grafana all deleted
- Tests green across packages
- All commits on `feat/scada-data-model`; FF-merged to `main`
