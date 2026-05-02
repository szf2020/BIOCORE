# BIOCore v1.13.0 — route-handler-split

**Release Date:** 2026-05-02
**Type:** Refactor — behavior preserving
**Tag:** `v1.13.0`

## TL;DR
v1.9.0 P2 bucket 1 split server's INFRASTRUCTURE into 7 modules (bootstrap / startup / reactor-wiring / ws-server / scheduler / ai-wiring / plc-bridge), but ~140 inline route handlers remained. v1.13.0 extracts the 5 highest-traffic groups into route-group siblings, matching the existing `*-routes.ts` pattern. **No functional changes.**

## Files extracted

| New file | LOC | What |
|---|---|---|
| `recipe-routes.ts` | 618 | Recipe CRUD + approval flow + status transitions |
| `reactor-routes.ts` | 488 | Reactor lifecycle + `/start`/`/stop`/`/estop`/`/restart` + `/phases/:phaseRef/...` unified handler + `download-recipe` |
| `auth-routes.ts` | 161 | `/auth/login` + `/auth/logout` + `/auth/me` |
| `batch-routes.ts` | 89 | Batch CRUD-read + phase status query (mutations stay with reactor-routes) |
| `audit-log-routes.ts` | 47 | Audit log read queries |
| **Total extracted** | **1403** | |

`index.ts`: **4287 → 3087** lines (-1200, -28%).

## Bonus: `buildReactorConfig` deduped

Previously duplicated 3× in `index.ts` (POST /reactors, /reactors/:id/download-recipe, runOrphanRecoveryScan callback per F2-AUTO). v1.13.0 commit `fa878c0` consolidates into one helper, callable from all sites + the new reactor-routes file. Closes a known follow-up from v1.12.0.

## Verification

- server tests: **28/28** unchanged after each commit
- batch-engine: **120/120** unchanged
- Full monorepo build clean
- Live smoke (curl + JWT auth):
  - `/auth/login` returns valid token ✓
  - `/recipes` returns 200 ✓
  - `/reactors` returns 200 ✓
  - `/batches?limit=5` returns 200 ✓
  - `/audit-logs?limit=5` returns 200 with prior F2-AUTO history ✓

## Versions Bumped

| File | v1.12.0 | v1.13.0 |
|---|---|---|
| `package.json` (root) | 1.12.0 | **1.13.0** |
| `packages/server/package.json` | 0.4.2 | **0.5.0** |

batch-engine / data-service / web-ui unchanged.

## Commits (5 in order)

1. `89d50d8` `refactor(server): extract recipe-routes from index.ts`
2. `ec431fd` `refactor(server): extract batch-routes from index.ts`
3. `fa878c0` `refactor(server): extract reactor-routes from index.ts + dedupe buildReactorConfig`
4. `2bc9be7` `refactor(server): extract auth-routes from index.ts`
5. `a6e62c1` `refactor(server): extract audit-log-routes from index.ts`

Each was build + test gated independently.

## Path forward

Remaining inline routes for follow-up (not in v1.13.0 — Phase 2/3 of route-handler-split):
- user-routes (CRUD users + role mgmt)
- api-key-routes
- reactor-config-routes
- interlock-config-routes / formula-config-routes / phase-template-routes
- trends-routes (InfluxDB queries)
- alarm-routes
- process-value-routes / ai-suggestion-routes
- admin-routes (already partially in middlewares/)

Estimated 1-2 more days to land the rest if desired. None block other work.

## Upgrade

```bash
docker compose stop biocore-server
git checkout v1.13.0
docker compose up -d --build biocore-server
```

No schema/migration change. No batch impact.
