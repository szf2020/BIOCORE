# BIOCore v1.9.0 — P2 Audit Roadmap

Release date: 2026-05-02  
Branch: `v1.9.0-server-split`  
Tag: _pending controller verification_

---

## Summary

v1.9.0 delivers three P2 buckets that improve server maintainability and
remove audit-related latency spikes from the engine emit chain.

---

## Bucket 1 — Server split (`packages/server`)

**Motivation:** `index.ts` had grown to ~3 900 lines. The reactor runtime
(manager, collector ticks, IL/RF metadata, event wiring) was the densest
cross-system cluster and the hardest to navigate.

**What changed:**
- Extracted `createReactorWiring()`, `reactorManager`, `reactorCollectorTimers`,
  `INTERLOCK_META`, `RUNNING_FAULT_META` into `reactor-wiring.ts` (~420 lines).
- `index.ts` calls `createReactorWiring({ sqlite, influxWriteApi, broadcast,
  autoCollectDoeResponses })` once after all dependencies are in scope.
- Zero behavioral change — all paths are byte-identical to the pre-split inline
  version.

---

## Bucket 2 — RecoveryPolicy injection (`packages/batch-engine`)

**Motivation:** Boot-time orphan recovery used a hard-coded `always-hold`
policy with no way to swap it in tests or for operators who want a less
conservative strategy after short outages.

**What changed:**
- Added `RecoveryPolicy` interface + `AlwaysHoldPolicy` (default) and
  `ConservativeShortOutagePolicy` to `batch-engine`.
- `runOrphanRecoveryScan()` in `startup.ts` now accepts an optional `policy`
  argument; defaults to `AlwaysHoldPolicy`, preserving v1.7.2 safety semantics.
- 17 new recovery-policy unit tests added to `batch-engine`.

---

## Bucket 3 — Audit micro-queue (`packages/server`)

**Motivation:** `sqlite.writeAuditLog()` (better-sqlite3, synchronous) was
called directly inside `ctrl.on('branch_evaluated')` — a listener on the
engine's emit chain. Under DB contention the sync write blocks
`readyNextPhase()`'s event propagation. This is a perf advisory from the
2026-05-02 perf review, not a stability bug.

**What changed:**
- New module `packages/server/src/audit-queue.ts`:
  - `AuditQueue` class — `enqueue()` is a pure array push; drain is
    scheduled via `setImmediate` on first enqueue so subsequent enqueues in
    the same tick coalesce into a single SQLite transaction.
  - `flushSync()` for graceful shutdown (drains synchronously before
    `sqlite.close()`).
  - `stats` object (`enqueued`, `drained`, `dropped`, `lastDrainMs`) for
    `/admin/metrics` observability.
  - Module-level `initAuditQueue(sqlite)` / `getAuditQueue()` singletons.
- `reactor-wiring.ts`: replaced `try { sqlite.writeAuditLog({…}) } catch`
  in `ctrl.on('branch_evaluated')` with `getAuditQueue().enqueue({…})`.
  Try/catch removed — `enqueue` is an array push and cannot fail.
- `index.ts`: `initAuditQueue(sqlite)` called before `createReactorWiring()`;
  `gracefulShutdown()` calls `getAuditQueue().flushSync()` before
  `sqlite.close()`.
- 9 new unit tests in `packages/server/src/__tests__/audit-queue.test.ts`.

**Not changed:** `sqlite.createAlarm()` paths remain synchronous (different
table, not audit_logs). Direct `writeAuditLog()` calls in route handlers
(user_create, batch approve/reject, etc.) remain synchronous — only the
high-frequency emit-chain path is queued.

---

## Version bumps

| Package | Before | After |
|---|---|---|
| root `biocore` | 1.8.0 | **1.9.0** |
| `@biocore/server` | 0.3.5 | **0.4.0** |
| `@biocore/batch-engine` | 0.2.2 | **0.2.3** |
| `@biocore/data-service` | 0.1.3 | **0.1.4** |

---

## Test counts

| Suite | Before | After |
|---|---|---|
| `@biocore/server` | 12 | **21** (+9) |
| `@biocore/batch-engine` | 86 | **86** (unchanged) |
| `@biocore/data-service` | 19 | 19 (unchanged) |

---

## Upgrade notes

No schema changes. No API changes. No config changes required.
The audit queue is transparent — existing audit_logs content and queries
are unaffected. The only observable difference is that `branch_evaluated`
audit rows are written one event-loop tick later than before.
