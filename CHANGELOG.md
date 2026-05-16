# Changelog

All notable changes since v1.14.0.

## Unreleased — feat/scada-data-model (2026-05-15)

158 commits. Adds full SCADA-style HMI with widget editor, write-intent loop, alarm system, and PLC dispatcher.

### SCADA (7 sub-projects)

**Sub-project 1 — Data model + REST API**
- `028-scada-schema.sql`: `scada_views` table (id, name, widgets JSON, bindings JSON, version)
- `scada-routes.ts`: 11 endpoints (list/get/create/update/delete/duplicate/publish + write-intent)
- Auth: `requireRole('admin'|'operator')` per route, audit log on every mutation
- 16/16 integration tests pass

**Sub-project 2 — useTag + useTagHistory hooks**
- Global `_tick` field on realtime-store (1Hz staleness signal)
- `useTag(reactorId, tag)`: subscribes to single tag, returns `{value, stale, lastUpdate}`
- `useTagHistory(reactorId, tag, windowMs)`: ring buffer + cutoff-based prune
- vitest + jsdom + @testing-library/react infra added to web-ui
- 6/6 hook tests pass

**Sub-project 3 — Widget library**
- 9 widgets: Lamp, Indicator, Pump, Valve, Tank, Trend, Button, Label, BoundWidget wrapper
- `registry.ts`: discriminated-union widget defs + render dispatch
- `transform.ts`: scaling + unit conversion (multiplier/offset)
- 11 widget tests pass

**Sub-project 4 — Widget view + write-intent**
- `WidgetView` reads `scada_views` + binds widgets to live tags via `useTag`
- `WriteIntentDialog`: operator-confirmed write-intent submission
- `ViewActionRouter`: routes button clicks → suggestion API (NEVER direct PLC)
- 3 component tests pass

**Sub-project 5 — Editor**
- `/scada/[viewId]/edit` page: drag-from-palette, property panel, bindings editor, save bar
- `useEditorState` with undo/redo (autosave + dirty tracking)
- Publish gates: name required, >=1 widget, all bindings resolved
- 10 editor tests pass

**Sub-project 6 — Suggestion review UI + WS toast**
- `/scada/suggestions` page: pending + failed lists
- `ScadaToast`: red dispatch_failed + yellow created variants (action allowlist)
- `SuggestionRow` dispatch_status badge: pending/dispatching/dispatched/failed
- Manual retry for failed dispatches (POST `/ai/suggestions/:id/retry-dispatch`)
- 15 new component tests

**Sub-project 7 — Engine PLC writer**
- `029-scada-dispatch.sql`: dispatch_status/retry_count/error/dispatched_at columns
- 6 SQLite dispatch methods (setDispatchPending, claimPendingDispatches, markDispatched,
  markDispatchFailed, incrementDispatchRetry, rollbackInProgressDispatches) + retryFailedDispatch
- `engine/plc-writer.ts`: PlcWriter interface + MockPlcWriter / S7PlcWriter (node-snap7) /
  ModbusPlcWriter skeleton; `createPlcWriter` factory with MOCK_PLC short-circuit
- `engine/scada-write-dispatcher.ts`: 500ms tick + retry state machine + audit
- `engine/recipe-plc-write.ts`: shared plcWrite for batch-controller recipe steps
- Live verified: suggestion #124 (accepted) -> dispatched in <1s via MockPlcWriter
- 14 new tests across data-service + server/engine

### Alarms

- `027-alarm-definitions.sql`: alarm_definitions table (user-configurable thresholds)
- `/alarm-configs` REST: POST/GET/PUT/DELETE + UNIQUE(code) validation (7 tests)
- `/alarms/history`: operational/cusum/all category split + severity/reactor/ack filters (6 tests)
- `/cusum/history`: cusum-only view (source=cusum_anomaly OR ai:* OR alarm_code=CUSUM_*)
- Web UI: `/settings/alarm-config` CRUD page, `/analysis/alarm-history`, `/analysis/cusum-history`

### HMI / FUXA

- FUXA migrated to monorepo native (`fuxa/` dir, docker-compose.fuxa.yml)
- HMI iframe edit-mode toggle (`/editor` vs `/lab`) + force-reload on toggle
- Replaced unreliable reachability probe with on-demand help overlay
- Friendly fallback when FUXA offline

### Refactors

- Recipe plcWrite extracted to `engine/recipe-plc-write.ts` (shared with SCADA dispatcher)
- M2.6 raw-materials feature removed (component, routes, migration, page)
- InterlockPanel inlined into ControlPanel + compact card layout
- Analysis page padding tightened (p-6 -> p-4)
- SPC nav icon TrendingUp -> BarChart3 (visual disambiguation)

### Security

- JWT_SECRET rotation post-public-push
- `.claude/settings.local.json` untracked + gitignored (contained admin JWTs)
- `.env.bak-*` gitignored
- audit-confirm uses apiFetch helper for consistent auth header injection
- MIT LICENSE added

### Tooling

- vitest + jsdom + @testing-library/react test infra (web-ui)
- gitignore: .bak files, nohup.out, package-lock.json, yarn.lock (repo uses pnpm)
