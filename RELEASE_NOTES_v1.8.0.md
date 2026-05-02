# BIOCore v1.8.0 — Trust Foundation

**Release date:** 2026-05-02
**Branch:** `v1.8.0-trust-foundation`
**Predecessor:** v1.7.3 (P0 security patches)

This release closes the auth-trust gaps identified by the v1.7.3 security
audit, removes a long-standing workspace-deps technical debt, and lands
four perf quick wins from a 2026-05-02 reviewer pass. The release is
organised into three internally-coherent buckets, each landed as its
own commit chain.

## Summary

| Bucket | Theme | Commits |
|--------|-------|---------|
| 1 | Auth trust foundation: bcrypt + JWT prod guard | 2 |
| 2 | Workspace deps + barrel canonicalisation | 5 |
| 3 | Perf quick wins (PLC reads + cache) | 2 |

---

## Bucket 1 — Auth trust foundation

Two server-side fixes that close the residual auth weakness behind
v1.7.3's role/CORS/migration patches.

### Bcrypt password hashing
`packages/server/src/index.ts` — login and password-change handlers now
verify and store password hashes via `bcrypt.compare` / `bcrypt.hash`
(work factor 10). On login against a legacy plaintext-hashed row the
server transparently re-hashes on success so the migration is silent.
The default-admin seed now hashes the bootstrap password the first time
it's written. 10 unit tests in `password-hashing.test.ts` cover hash
verification, hash-on-rotation, and constant-time comparison.

### JWT secret prod guard
Server boot now refuses to start in `NODE_ENV=production` if `JWT_SECRET`
is unset or equals the documented dev fallback. In dev it logs a warning
and proceeds. This eliminates the "shipped with default secret" failure
mode the audit flagged.

---

## Bucket 2 — Workspace deps + barrel canonicalisation

A 5-commit cleanup that fixes long-standing import drift across the
monorepo.

1. **Public barrels** — every workspace package the server consumes now
   exports a curated `index.ts` barrel listing exactly the symbols that
   are part of its public surface. Internal helpers stay un-exported.
2. **Workspace deps** — `packages/server/package.json` now declares
   `workspace:*` deps for `batch-engine`, `soft-sensor`, `ai-analytics`,
   `ai-gateway`, `notifier`, `runtime-guard`, `experiment-optimizer`.
   pnpm refuses to resolve un-declared deps starting with v1.8.0.
3. **Barrel canonicalisation** — `data-service` barrel now re-exports
   from `./sqlite-service` directly (no transitive `./index → ./service
   → ./sqlite-service` hop).
4. **Deep-import refactor** — `../../X/src/Y` paths in server have been
   replaced with `@biocore/X` imports; all consumers now resolve through
   the package's barrel.
5. **Documented exception** — `plc-driver` keeps one
   `@biocore/plc-driver/dist/pure-utils` deep import for tag parsing
   utilities that should not be exposed publicly. Comment in the
   importer documents why the deep import is intentional.

No runtime behaviour change; mostly a future-proofing pass for pnpm 10
strictness.

---

## Bucket 3 — Perf quick wins (this release's third bucket)

Four issues identified in the 2026-05-02 perf reviewer audit; three
implemented, one deferred (see Concerns).

### Fix 1 — Parallelise `readProcessValues()` (commit `e6c37b1`)
`packages/batch-engine/src/batch-controller.ts` — the per-tick PLC PV
read loop replaced `for...of` + serial `await` with `Promise.all` over
the 12 tags. On real S7 hardware (~3ms RTT) this collapses 12×3 = 36ms
to ~3ms per tick. On `MOCK_PLC=true` the reads are sync so no observable
delta. Per-tag `try/catch` silent-skip semantics preserved — one bad
tag does not poison the whole snapshot.

### Fix 2 — Memoise `phaseStatuses` getter (commit `e6c37b1`)
Same file. The getter was called 5–6 times per tick per reactor and
re-sorted the Map values on every call. Added a private cache + dirty
flag. The cache is invalidated only on Map structural changes (`.set` /
`.delete` / `.clear`); in-place value mutations (`ps.state = 'running'`)
remain visible through the cache because the array shares value
references. Two new unit tests cover identity-based cache invalidation
and shared-reference visibility.

Tests delta: batch-engine 65 → 69 (4 new tests for fixes 1 + 2).

### Fix 3 — Dedupe PLC reads in InfluxDB collector (commit `4c65684`)
`packages/server/src/index.ts` — `startReactorCollector`'s 60-second
tick was calling `devPlcRead(tag)` ~32 times per tick (~18 for the
InfluxDB Point + ~14 for the WS broadcast pvPayload), though only 19
unique tags are actually consumed. Hoisted into a single `rawPV` map;
each tag is now read once. Behaviour is byte-identical: same fields
written to InfluxDB, same channels broadcast.

`devPlcRead` is currently a sync random-walk simulator; under
`MOCK_PLC=false` the read becomes async and the 32 → 19 reduction will
yield real network savings on real S7 hardware.

### Fix 4 — Audit-logs archive table (deferred)
The audit reviewer suggested a `audit_logs_archive` table + idempotent
`archiveAuditLogs()` helper to give DBAs a way to query old audit rows.

Deferred to a later release with a stronger signal. The two reasons:

1. **The immutability trigger blocks any prune path.** `audit_logs` has
   `BEFORE DELETE` and `BEFORE UPDATE` triggers (`SELECT RAISE(ABORT)`)
   for compliance. Even if we archive, the live table keeps growing —
   the archive just doubles storage without speeding up the hot table.
2. **No operator pain signal yet.** The frontend audit-logs page paginates
   with a default time range, so back-end query slowness is hypothetical
   until somebody reports it.

Doing the trigger redesign + archive + prune is a deliberate compliance
conversation, not a "quick win." When the signal lands, this comes back
as a v1.9 capability.

---

## Version bumps

| Package | v1.7.3 | v1.8.0 |
|---------|-------|--------|
| `biocore` (root) | 1.7.3 | **1.8.0** |
| `@biocore/server` | 0.3.3 | 0.3.5 |
| `@biocore/batch-engine` | 0.2.1 | 0.2.2 |

`data-service` stays at `0.1.3` — bucket 2's barrel cleanup is internal
and bucket 3's deferred fix 4 is the only thing that would have bumped
it.

## Tests at release

| Package | Count | Status |
|---------|-------|--------|
| `@biocore/batch-engine` | 69 | all passing |
| `@biocore/server` | 12 | all passing |
| `@biocore/data-service` | 17 / 33 | unchanged from v1.7.3 (16 pre-existing failures) |

## Breaking changes

None.

## Migration notes

- **Bcrypt rotation is automatic** — first login after upgrade re-hashes
  any plaintext-hashed legacy row. No operator action required.
- **`JWT_SECRET` must be set in production** — without it, server boot
  fails in `NODE_ENV=production`. Dev still has a fallback warning.
