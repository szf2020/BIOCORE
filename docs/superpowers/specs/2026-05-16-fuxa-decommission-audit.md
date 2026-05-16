# SP7 FUXA 退役审计 — Decommission Audit

**Date:** 2026-05-16
**Sub-project:** 7/8 of FUXA replacement
**Status:** AUDIT-ONLY (no destructive changes)
**Branch:** `feat/scada-data-model` → `main`

---

## Goal

Document the full FUXA dependency surface in BIOCORE, the production data residency, and the migration / decommission path. **No deletions in SP7.** Actual removal blocked on (a) data migration completion and (b) explicit user approval.

---

## Current state (2026-05-16)

### Production data inventory

| Location | Size | Content | Migration status |
|---|---|---|---|
| `packages/server/data/biocore.db` `scada_views` | – | 2 rows: `demo_v1`, `demo_edit_v1` (both `is_svg=0`) | Schema at migration 030; **migration 031 NOT applied** |
| `fuxa/appdata/project.fuxap.db` | 3.0 MB | **13 production views** in FUXA JSON format | Not migrated to BIOCORE |
| `fuxa/appdata/users.fuxap.db` | 20 KB | FUXA user accounts (synced from BIOCORE via `fuxa-user-sync.ts`) | One-way derived; BIOCORE is source of truth |
| `fuxa/appdata/alarms.fuxap.db` | 20 KB | FUXA alarm rules | Unknown overlap with BIOCORE alarms |
| `fuxa/appdata/apikeys.fuxap.db` | 12 KB | FUXA API keys | FUXA-internal only |
| `packages/fuxa/` | 241 MB | FUXA native node runtime | Whole sub-project |

**Critical:** SP1–SP6 (all 6 sub-projects of FUXA replacement) shipped on `feat/scada-data-model` and merged to `main`, but **production has never run the new SVG stack**. The 2 `scada_views` rows are demo records from SP1. The 13 real production views still live exclusively in FUXA.

### FUXA view JSON shape (source)

```jsonc
{
  "id": "v_12121374898-71096",
  "name": "CM_AI",
  "profile": { "width": 336, "height": 386, "bkcolor": "#e7e7e7ff", "margin": 10 },
  "items": {
    "VAL_9e966bcb-cbad41ab": {
      "id": "VAL_9e966bcb-cbad41ab",
      "type": "svg-ext-value",
      "name": "objectName",
      "property": {
        "events": [],
        "actions": [],
        "variableId": "t_7e06241a-b12748c2",
        "ranges": [{ "type": 1, "min": 20, "max": 80, "color": "", "stroke": "", "textId": null, "text": "", "fractionDigitsId": null, "fractionDigits": "" }],
        "variableValue": ""
      },
      "label": "Value"
    }
    // ... typically dozens of widgets per view
  }
}
```

### BIOCORE `SvgViewJson` shape (target)

```ts
interface SvgViewJson {
  width: number;
  height: number;
  background?: string;
  items: SvgWidgetItem[];   // array, NOT Record
}
interface SvgWidgetItem {
  id: string; type: string;
  x: number; y: number; w: number; h: number;
  rotation?: number;
  props?: Record<string, unknown>;
  bindings?: { tag?: string };
  animations?: SvgAnimation[];
  link?: { viewId: string };
  writeIntent?: { tag: string; value?: number|string|boolean };
}
```

### Shape gap

FUXA → BIOCORE conversion is **lossy** without manual review:

- FUXA `items` is `Record<id, widget>`; BIOCORE is `array`. Reorder/zIndex semantics differ.
- FUXA stores `x`, `y`, `w`, `h` inside SVG markup (`property.svgContent`), not as top-level fields. Need DOM-parse step.
- Widget type names differ entirely (`svg-ext-value`, `HXT_*`, `VAL_*` → BIOCORE has `svg-rect`, `svg-lamp`, `svg-trend`, etc.). No 1:1 map; many FUXA widgets have no BIOCORE equivalent.
- Variable bindings: FUXA `property.variableId` → BIOCORE `bindings.tag` (need lookup table).
- Actions: FUXA `property.actions[]` (multi-action) → BIOCORE `link` (single navigate) or `writeIntent` (single write). Many actions will not transfer.

---

## FUXA dependency surface

### Frontend (legacy paths)

```
packages/web-ui/src/app/scada/                              KEEP until prod migration
  layout.tsx
  page.tsx                                                  # SCADA view list (legacy)
  suggestions/page.tsx                                      # Suggestion review UI
  [viewId]/page.tsx                                         # Legacy viewer (WidgetView)
  [viewId]/edit/page.tsx                                    # Legacy editor

packages/web-ui/src/components/scada/
  WidgetView.tsx + test                                     KEEP until migration
  ViewActionRouter.tsx + test                               KEEP until migration
  WriteIntentDialog.tsx + test                              KEEP (legacy dialog used at /scada/)
```

### Backend bridge

```
packages/server/src/fuxa-user-sync.ts                       BIOCORE -> FUXA user sync (one-way)
packages/server/src/index.ts:30,31,672-675                  FuxaUserSync init
packages/server/src/auth-routes.ts:111                      FUXA iframe cookie hack
packages/server/src/mqtt-publisher.ts                       Publishes for FUXA consumption (and others)
packages/server/src/mqtt-subscriber.ts                      Receives FUXA write intents
```

### Infrastructure

```
packages/fuxa/                                  241 MB  FUXA monorepo sub-package (native node)
fuxa/                                           3.3 MB  Runtime data dir
  appdata/project.fuxap.db                      3.0 MB  13 production views
  appdata/users.fuxap.db                        20 KB   Synced users
  appdata/alarms.fuxap.db                       20 KB   FUXA alarm rules
  appdata/apikeys.fuxap.db                      12 KB   API keys
  logs/                                                  Runtime logs
nginx/nginx.conf                                         /fuxa/ reverse proxy
docker-compose.yml                                       FUXA bridge comments
observability/grafana/dashboards/biocore-fuxa-integration.json
scripts/fuxa-patches/                                    Source patches applied at install
```

---

## Migration / decommission plan

### Phase 0 — Backup (PREREQUISITE before any deletion)

Create `fuxa-archive-2026-05-16/` at repo root with:

```bash
mkdir -p fuxa-archive-2026-05-16/{appdata,logs,server,scripts}
cp -a fuxa/appdata/*.db fuxa-archive-2026-05-16/appdata/
cp -a fuxa/logs fuxa-archive-2026-05-16/
cp -a packages/fuxa/server fuxa-archive-2026-05-16/server/
cp -a scripts/fuxa-patches fuxa-archive-2026-05-16/scripts/
cp packages/server/data/biocore.db fuxa-archive-2026-05-16/biocore-before-migration.db
tar -czf fuxa-archive-2026-05-16.tar.gz fuxa-archive-2026-05-16/
```

Archive `fuxa-archive-2026-05-16.tar.gz` must be added to backup retention before deletion. Keep at least 90 days post-decommission.

### Phase 1 — Apply migration 031 to production

```bash
cd /Volumes/SSD/BIOCORE/packages/server
node -e "require('better-sqlite3')(process.env.BIOCORE_DB || 'data/biocore.db').exec(require('fs').readFileSync('migrations/031-scada-view-template-flag.sql','utf8'))"
```

Verify:
```bash
sqlite3 packages/server/data/biocore.db "PRAGMA table_info(scada_views);" | grep is_template
```

### Phase 2 — Per-view migration decision

For each of the 13 FUXA views, decide one of:

| Decision | Action | Effort |
|---|---|---|
| **Drop** | View is obsolete; skip migration | low |
| **Manual rebuild** | Engineer rebuilds in `/scada2/edit/new` referencing FUXA screenshot | medium per view |
| **Auto-convert (best-effort)** | Write `scripts/fuxa-import.ts` that parses FUXA JSON + emits `SvgViewJson` (lossy) | high one-time + per-view review |

Recommended: **drop dev/test views, manual rebuild operator-critical views**. The auto-convert path is high-effort and the conversion still requires human review per widget mapping.

Per-view inventory needs filling by domain expert:

```
view_id                              size_kb  decision   notes
v_12121374898-71096 (CM_AI)          434      ?
v_313a749b1-1b91                     403      ?
v_98694595-35510                     395      ?
v_b6554bb8-32120                     386      ?
v_11b4114699-b345                    229      ?
v_010121349ab-312a1                  228      ?
v_1a10a4a99-2133                     147      ?
v_91994397-708a                      92       ?
v_8118b42a2-345b                     76       ?
v_0712346b1-12b1210                  30       ?
(plus 3 more unlisted, smaller)
```

### Phase 3 — Cutover smoke

Once all critical views exist in `scada_views` with `is_svg=1`:
1. Operators verify each new view renders + behaves identically
2. nginx route `/fuxa/` flipped to 404 (one-line config change)
3. Soak period: >= 7 days with FUXA still installed but unreachable

### Phase 4 — Decommission

After soak period with no rollback:
1. Stop FUXA process; remove init script
2. Remove `nginx/nginx.conf` `/fuxa/` block
3. Remove `docker-compose.yml` FUXA comments
4. Delete `packages/fuxa/` (241 MB)
5. Delete `fuxa/` runtime data dir (archive already exists)
6. Delete `scripts/fuxa-patches/`
7. Delete `packages/server/src/fuxa-user-sync.ts`
8. Remove `index.ts` import + init
9. Remove `auth-routes.ts:111` FUXA iframe cookie comment + check if cookie still needed
10. Update MQTT publisher/subscriber comments to drop "FUXA" naming (keep code — used by other subscribers)
11. Update observability dashboard or delete it
12. Delete `packages/web-ui/src/app/scada/` tree
13. Delete `packages/web-ui/src/components/scada/{WidgetView,ViewActionRouter,WriteIntentDialog}.tsx` + tests
14. Update navigation/links pointing to legacy `/scada/`

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Production views lost during decommission | CRITICAL | Phase 0 backup; Phase 3 soak period; explicit operator sign-off |
| FUXA user sync removal locks out operators | HIGH | Verify BIOCORE login works standalone before SP7 Phase 4 |
| MQTT downstream consumers depend on FUXA-published topics | HIGH | Audit MQTT subscribers; document who reads `boot`, `process_values`, etc. |
| nginx `/fuxa/` removal breaks bookmarked URLs | MEDIUM | Add 301 redirect to `/scada2` for soak period |
| Auto-convert losing widget bindings | HIGH | Manual review per widget mandatory |
| Migration 031 fails on prod DB (e.g., column conflict from another path) | MEDIUM | Phase 0 backup; verify schema before apply |

---

## Open questions for user

These block Phase 2 and beyond:

1. **Which of the 13 FUXA views are operator-critical?** (Manual rebuild vs drop.)
2. **Do operators currently use `/fuxa/` directly, or only via embedded routes?** (Affects nginx flip safety.)
3. **Are FUXA alarms (`alarms.fuxap.db`) the same as BIOCORE alarms or independent?** (Affects whether to migrate.)
4. **What's the acceptable soak period?** (Phase 3.)
5. **Should `auto-convert` be attempted, or skip straight to manual rebuild?**

---

## Out of scope (deferred to SP8 or beyond)

- FUXA asset port: reusable icons / images / SVG fragments worth keeping
- New widget types BIOCORE lacks (e.g., bar gauge, multi-line chart) discovered during migration
- E2E test coverage for migrated views

---

## Done criteria for SP7 (audit phase only)

- This document committed
- Production data inventory captured
- FUXA dependency surface mapped
- Migration plan documented per phase
- Risk register filled
- Wait for user decisions on the 5 open questions before SP7.5 (execution) starts

---

## SP7.5 (next, blocked on user)

Once user answers the open questions, generate SP7.5 implementation plan covering:
- Phase 0 backup script (executable)
- Phase 1 prod migration (one-shot script)
- Phase 2 per-view decisions table filled
- Optional: `scripts/fuxa-import.ts` auto-converter
- Phase 3 soak monitoring
- Phase 4 deletion sequence with halt gates
