# v1.12.0 — F2-AUTO actor restart on auto_resume

## TL;DR

`RecoveryPolicy 'auto_resume'` decision now actually restarts the engine instead of falling back to hold + logging "deferred". The decision/action separation introduced in v1.9.0 P2 bucket 2 is finally completed end-to-end.

Default behavior is **unchanged** — the bundled `defaultRecoveryPolicy` still always returns `'hold'`. F2-AUTO is opt-in via env var.

## What changed

### `BatchController.resumeAndStart(batchId, recipe, savedNodeId)` (new public API)

Combines the existing `resumeBatch()` state-rebuild primitive with the actor + polling lifecycle steps that the boot orphan scan needs in order to actually resume a batch after a crash.

- Step 1 — calls `resumeBatch()` to rebuild DAG / DAGExecutor / phaseStatusesMap / currentNodeId.
- Step 2 — sends `cmd_start` to the XState actor only if currentState is still `'idle'`.
- Step 3 — starts the polling tick loop if not already running.
- **Idempotent**: calling on a running controller with an existing pollTimer is a no-op (returns success without scheduling a second timer).
- Emits `'batch_started'` with `resumed: true` so observers can distinguish a fresh start from an auto-resume.

### `BIOCORE_RECOVERY_POLICY=conservative` (new env opt-in)

Server reads `BIOCORE_RECOVERY_POLICY` at boot and chooses the recovery policy:

- unset / empty / `default` / unknown → `defaultRecoveryPolicy` (always-hold, v1.7.2 safety semantics)
- `conservative` → `conservativeShortOutagePolicy` (auto_resume only when `prevState=running` + `commHealthy` + `ageSinceLastAuditMs < 30s` + non-hazardous phaseType)

`pickRecoveryPolicyFromEnv()` is exported from `./startup` for tests and downstream consumers.

### Boot orphan scan — `'auto_resume'` branch wired

Previously logged "deferred" and fell back to hold. Now:

1. Look up the recipe via `sqlite.getRecipe()`. Missing → fall back to hold + warn.
2. Look up the reactor's config via `sqlite.getReactorConfig()`. Missing → fall back to hold + warn.
3. Register the reactor in `reactorManager` if not already present (using the same `buildReactorConfig` pattern as the `/reactors` POST handler).
4. Call `ctrl.resumeAndStart(batchId, recipe, currentNodeId)`.
5. Write a `'batch_auto_resumed'` audit row on success, or a `'batch_held_recovery_auto_resume_failed'` row with `fallback_reason` on any precondition failure.

Boot summary log now reports `auto_resumed` and `auto_resume_failed` counters in addition to `held` / `aborted`.

The `runOrphanRecoveryScan({ ... })` call in `index.ts` now passes a `reactorRuntime` block — pre-v1.12.0 callers that omit it still work and gracefully fall back to hold (with `fallback_reason='reactor_runtime_unavailable'`).

## Versions

- **root**: `1.11.1` → **`1.12.0`** (new feature, semver minor)
- **`@biocore/batch-engine`**: `0.3.1` → **`0.3.2`** (added `resumeAndStart` public API)
- **`@biocore/server`**: `0.4.1` → **`0.4.2`** (boot scan auto_resume wired + env opt-in)

## Migration

No action required for existing deployments. The default policy is still always-hold; behavior is unchanged unless an operator explicitly sets `BIOCORE_RECOVERY_POLICY=conservative`.

## Tests

- `@biocore/batch-engine`: 115 → **120** (+5 covering `resumeAndStart` from idle, idempotency, polling-timer setup, R1 fallback, batch_started event)
- `@biocore/server`: 21 → **28** (+7 covering env-var policy switch, auto_resume happy path, recipe-missing fallback, reactor-config-missing fallback, missing-runtime fallback, default-policy regression)

## Branch / commits

Branch: `f2-auto-resume` (off `main` at v1.11.1).
Commits:
1. `feat(batch-engine): BatchController.resumeAndStart() for crash auto-recovery (F2-AUTO)`
2. `feat(server): boot scan auto_resume actually restarts engine; BIOCORE_RECOVERY_POLICY env (F2-AUTO)`
3. `release: v1.12.0 — F2-AUTO actor restart on auto_resume`

Not tagged. Not merged to main.
