// ============================================================
// startup — boot-time initialization helpers
// ============================================================
// Extracted from index.ts (v1.9.0 P2 bucket 1).
//
// Owns the boot-sequence side effects that need to run before
// server.listen() can safely accept traffic:
//
//   - setupMigrations(db) → Promise<void>
//       Kicks off the migrator IIFE; failure is fatal (process.exit(1)).
//       The returned promise is awaited inside index.ts's start() so
//       requests cannot land on an un-migrated schema (v1.7.3 H7).
//
//   - ensureAdminAccount({db, hashPasswordBcrypt})
//       Recreates the default admin row if missing or the stored
//       password_hash is in an unrecognized format. Async because
//       bcrypt is async (v1.8.0 bucket 1).
//
//   - assertJwtSecretSafe()
//       Production fail-fast guard for the dev default JWT_SECRET.
//       Logs warning in dev (v1.8.0 bucket 1).
//
//   - runOrphanRecoveryScan({db, sqlite})
//       v1.7.2 boot-time crash-recovery: any batch left in
//       running/held/paused → mark as held with audit row so
//       operators can decide resume/abort. Wrapped in try/catch so a
//       scan failure cannot block server startup.
// ============================================================

import type Database from 'better-sqlite3';

import { runMigrations } from './migrator';
import { getOrphanBatches, markBatchHeldForRecovery, markBatchAborted } from '@biocore/data-service';
import {
  defaultRecoveryPolicy,
  conservativeShortOutagePolicy,
  type RecoveryPolicy,
  type RecoveryDecisionInput,
  type BatchControllerConfig,
  ReactorManager,
} from '@biocore/batch-engine';

const DEFAULT_JWT_SECRET = 'biocore-dev-secret-change-in-production';

export function setupMigrations(db: Database.Database): Promise<void> {
  // v1.7.3 H7: server.listen 必须等到 migrations 完成后再触发。
  // 这是一个 Promise, 在 index.ts 底部的 start() 中被 await。
  // 失败 → 致命退出, 不再 fire-and-forget。
  return (async () => {
    try {
      await runMigrations(db);
    } catch (e) {
      console.error('[Migrator] 致命错误, 服务无法启动:', (e as Error).message);
      process.exit(1);
    }
  })();
}

export interface EnsureAdminAccountOptions {
  db: Database.Database;
  hashPasswordBcrypt: (password: string) => Promise<string>;
}

// 初始化默认admin用户 (如果不存在或 hash 是无效格式)
// v1.7.3 H7: 此调用在 start() 中触发, 与 setupMigrations 串行。
export async function ensureAdminAccount(opts: EnsureAdminAccountOptions): Promise<void> {
  const { db, hashPasswordBcrypt } = opts;
  try {
    const existing: any = db.prepare('SELECT user_id, password_hash FROM users WHERE username = ?').get('admin');
    // 接受两种格式: 旧 sha256 (salt:hash) 或 新 bcrypt ($2[aby]$...)
    const ph: string | undefined = existing?.password_hash;
    const hashOk = !!ph && (
      /^[a-f0-9]{32}:[a-f0-9]{64}$/.test(ph) ||
      /^\$2[aby]\$/.test(ph)
    );
    if (!existing || !hashOk) {
      const hash = await hashPasswordBcrypt('admin123');
      if (existing) {
        db.prepare('UPDATE users SET password_hash = ?, display_name = ?, role = ?, is_active = 1 WHERE username = ?')
          .run(hash, '系统管理员', 'admin', 'admin');
        console.log('[BOOT] Default admin account password reset. Password set in DB; reset via reset-admin script before production.');
      } else {
        db.prepare(`INSERT INTO users (user_id, username, display_name, password_hash, role)
          VALUES (?, ?, ?, ?, ?)`).run('admin-001', 'admin', '系统管理员', hash, 'admin');
        console.log('[BOOT] Default admin account created. Password set in DB; reset via reset-admin script before production.');
      }
    }
  } catch (e) {
    console.error(`[${new Date().toISOString()}] [ERROR] 初始化admin失败:`, e);
  }
}

/**
 * v1.8.0 bucket 1: JWT_SECRET production guard. Fail fast in production
 * if the dev default is still in use; warn loudly in dev.
 */
export function assertJwtSecretSafe(): void {
  const effectiveJwtSecret = process.env.JWT_SECRET ?? DEFAULT_JWT_SECRET;
  if (effectiveJwtSecret === DEFAULT_JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[FATAL] JWT_SECRET is set to the default value in production. Set a strong unique secret in env before starting.');
      process.exit(1);
    } else {
      console.warn('[WARN] JWT_SECRET is the default dev value. Set a strong secret before deploying to production.');
    }
  }
}

export interface OrphanRecoveryOptions {
  db: Database.Database;
  sqlite: {
    writeAuditLog: (e: any) => void;
    /** Optional: used to look up phaseType for the orphan's current phase index. */
    getRecipe?: (recipeId: string, version?: string) => any;
    /**
     * v1.12.0 F2-AUTO: required when policy can return 'auto_resume'.
     * Returns the reactor_configs row (or undefined if missing). Lack of a
     * reactor-config row → fall back to hold for safety.
     */
    getReactorConfig?: (reactorId: string) => any;
    /**
     * v1.12.0 F2-AUTO: optional. Caller-supplied parser that turns the raw
     * `recipes` row into the Recipe shape that BatchController.resumeAndStart
     * expects. The server already has a parseRecipeRow() helper — pass it in
     * here to avoid duplicating recipe-row decoding logic in startup.ts.
     */
    parseRecipeRow?: (row: any) => any;
  };
  /**
   * v1.9.0 P2 bucket 2: pluggable decision strategy.
   * Default = `defaultRecoveryPolicy` (always-hold, preserves v1.7.2 behavior).
   * Caller in index.ts may pass a custom policy once F2-AUTO is implemented.
   *
   * v1.12.0 F2-AUTO: when omitted, `BIOCORE_RECOVERY_POLICY=conservative`
   * env var swaps in `conservativeShortOutagePolicy`. Otherwise keeps the
   * always-hold default — opt-in only.
   */
  policy?: RecoveryPolicy;
  /**
   * v1.12.0 F2-AUTO: reactor manager + factory for the auto_resume branch.
   * When omitted, the orphan scan falls back to hold even when policy
   * returns 'auto_resume' (back-compat with pre-v1.12.0 startup callers).
   */
  reactorRuntime?: {
    reactorManager: ReactorManager;
    /**
     * Build a BatchControllerConfig for the given reactor (when the manager
     * has no controller for that reactor yet). Mirrors the buildReactorConfig
     * pattern used by the `/reactors` POST handler in index.ts.
     */
    buildReactorConfig: (reactorId: string) => BatchControllerConfig;
    /** Hook the reactor's events into ws / influx / audit (same as the route handler does). */
    wireReactorEvents: (reactorId: string) => void;
  };
}

/**
 * v1.12.0 F2-AUTO: pick the recovery policy based on env var.
 * Default behavior MUST stay always-hold; conservative is opt-in via
 * `BIOCORE_RECOVERY_POLICY=conservative`. Anything else (or missing) →
 * defaultRecoveryPolicy.
 */
export function pickRecoveryPolicyFromEnv(envValue: string | undefined): RecoveryPolicy {
  if (envValue === 'conservative') return conservativeShortOutagePolicy;
  return defaultRecoveryPolicy;
}

/**
 * v1.7.2 + v1.9.0 P2 bucket 2: boot-time crash-recovery scan.
 *
 * Any batch left in current_state ∈ {running, held, paused} when this server
 * process starts is by definition orphaned — its previous engine died with
 * the previous process. v1.7.2 behavior was unconditional "mark as held".
 *
 * v1.9.0 P2 bucket 2 introduces a `RecoveryPolicy` strategy layer. For each
 * orphan we build a `RecoveryDecisionInput` (prev state, phase type from
 * recipe, age since last audit, comm health) and ask the policy to decide:
 *   - 'hold'        → existing v1.7.2 path (mark held + audit)
 *   - 'auto_resume' → NOT YET IMPLEMENTED (F2-AUTO). Falls back to hold for
 *                     safety + writes a distinct audit action so we can see
 *                     when the policy *would* have auto-resumed.
 *   - 'abort'       → mark batch stopped (cmd_stop) + audit. Used only by
 *                     opt-in aggressive policies; default policy never returns
 *                     this verdict.
 *
 * Known limitation: `commHealthy` is hard-coded to `true` here because at the
 * time this scan runs, reactor controllers / PLC bridge have not been wired
 * yet (see index.ts boot order). A future bucket can thread reactor health
 * in once the order is reshuffled.
 */
export function runOrphanRecoveryScan(opts: OrphanRecoveryOptions): void {
  const { db, sqlite, policy = defaultRecoveryPolicy, reactorRuntime } = opts;
  try {
    const recoveryReason = `server_restart_recovery@${new Date().toISOString()}`;
    const orphans = getOrphanBatches(db);
    if (orphans.length === 0) {
      console.log('[BOOT] 无遗留批次需恢复');
      return;
    }

    console.warn(`[BOOT] 检测到 ${orphans.length} 个遗留批次 (上次进程崩溃前未结束), 通过 RecoveryPolicy 决策处理`);

    let heldCount = 0;
    let autoResumedCount = 0;
    let autoResumeFallbackCount = 0;
    let abortedCount = 0;

    for (const o of orphans) {
      try {
        // Build the decision input
        const input = buildRecoveryDecisionInput(db, o, sqlite);
        const decision = policy.decide(input);

        if (decision === 'auto_resume') {
          // v1.12.0 F2-AUTO: actually restart the engine. On any precondition
          // failure (recipe missing, reactor-config missing, addReactor throws,
          // controller refuses cmd_start) → fall back to hold and warn so
          // operators see the degraded path.
          const resumeResult = tryAutoResume(db, o, sqlite, reactorRuntime, recoveryReason);
          if (resumeResult.ok) {
            sqlite.writeAuditLog({
              user_id: 'system',
              action: 'batch_auto_resumed',
              target_type: 'batch',
              target_id: o.batch_id,
              target_kind: 'batch_id',
              batch_id: o.batch_id,
              reason: recoveryReason,
              new_value: JSON.stringify({
                prev_state: o.current_state,
                recipe_id: o.recipe_id,
                recipe_version: o.recipe_version,
                reactor_id: o.reactor_id,
                current_node_id: o.current_node_id,
                current_phase_index: o.current_phase_index,
                phase_type: input.phaseType,
                policy_decision: 'auto_resume',
                decision_input: input,
              }),
            });
            autoResumedCount++;
            console.log(
              `[BOOT] auto-resumed batch ${o.batch_id} on reactor ${o.reactor_id} (node=${o.current_node_id ?? 'NULL'})`,
            );
          } else {
            // Fall back to hold, log warn so the degraded path is visible.
            console.warn(
              `[BOOT] auto_resume failed for batch ${o.batch_id} (${resumeResult.reason}); falling back to hold`,
            );
            markBatchHeldForRecovery(db, o.batch_id, recoveryReason);
            sqlite.writeAuditLog({
              user_id: 'system',
              action: 'batch_held_recovery_auto_resume_failed',
              target_type: 'batch',
              target_id: o.batch_id,
              target_kind: 'batch_id',
              batch_id: o.batch_id,
              reason: recoveryReason,
              new_value: JSON.stringify({
                prev_state: o.current_state,
                recipe_id: o.recipe_id,
                recipe_version: o.recipe_version,
                reactor_id: o.reactor_id,
                current_node_id: o.current_node_id,
                current_phase_index: o.current_phase_index,
                policy_decision: 'auto_resume',
                fallback: 'hold',
                fallback_reason: resumeResult.reason,
                decision_input: input,
              }),
            });
            autoResumeFallbackCount++;
            console.warn(
              `[BOOT]   - ${o.batch_id} (reactor=${o.reactor_id}, prev_state=${o.current_state}, decision=auto_resume→hold, why=${resumeResult.reason})`,
            );
          }
        } else if (decision === 'abort') {
          markBatchAborted(db, o.batch_id, recoveryReason);
          sqlite.writeAuditLog({
            user_id: 'system',
            action: 'batch_aborted_for_recovery',
            target_type: 'batch',
            target_id: o.batch_id,
            target_kind: 'batch_id',
            batch_id: o.batch_id,
            reason: recoveryReason,
            new_value: JSON.stringify({
              prev_state: o.current_state,
              recipe_id: o.recipe_id,
              recipe_version: o.recipe_version,
              reactor_id: o.reactor_id,
              current_node_id: o.current_node_id,
              current_phase_index: o.current_phase_index,
              policy_decision: 'abort',
              decision_input: input,
            }),
          });
          abortedCount++;
          console.warn(`[BOOT]   - ${o.batch_id} (reactor=${o.reactor_id}, prev_state=${o.current_state}, decision=abort)`);
        } else {
          // 'hold' — preserves v1.7.2 path
          markBatchHeldForRecovery(db, o.batch_id, recoveryReason);
          sqlite.writeAuditLog({
            user_id: 'system',
            action: 'batch_held_for_recovery',
            target_type: 'batch',
            target_id: o.batch_id,
            target_kind: 'batch_id',
            batch_id: o.batch_id,
            reason: recoveryReason,
            new_value: JSON.stringify({
              prev_state: o.current_state,
              recipe_id: o.recipe_id,
              recipe_version: o.recipe_version,
              reactor_id: o.reactor_id,
              current_node_id: o.current_node_id,
              current_phase_index: o.current_phase_index,
            }),
          });
          heldCount++;
          console.warn(`[BOOT]   - ${o.batch_id} (reactor=${o.reactor_id}, prev_state=${o.current_state}, node=${o.current_node_id ?? 'NULL'}, decision=hold)`);
        }
      } catch (e) {
        console.error(`[BOOT] 处理遗留批次 ${o.batch_id} 失败:`, (e as Error).message);
      }
    }

    console.log(
      `[BOOT] orphan recovery: ${heldCount} held, ${autoResumedCount} auto_resumed, ${autoResumeFallbackCount} auto_resume_failed, ${abortedCount} aborted`,
    );
  } catch (e) {
    console.error('[BOOT] 崩溃恢复扫描失败 (server 仍正常启动):', (e as Error).message);
  }
}

/**
 * v1.12.0 F2-AUTO — try to auto-resume a single orphan batch by:
 *   1. Looking up the recipe (sqlite.getRecipe + parseRecipeRow).
 *   2. Looking up the reactor's config (sqlite.getReactorConfig).
 *   3. Registering the reactor in reactorManager if not already present.
 *   4. Calling ctrl.resumeAndStart(batchId, recipe, savedNodeId).
 *
 * Returns { ok: true } on success or { ok: false, reason } on any precondition
 * failure. The caller is responsible for the hold-fallback path on failure.
 */
function tryAutoResume(
  _db: Database.Database,
  orphan: {
    batch_id: string;
    recipe_id: string;
    recipe_version: string;
    reactor_id: string;
    current_state: string;
    current_node_id: string | null;
    current_phase_index: number | null;
  },
  sqlite: OrphanRecoveryOptions['sqlite'],
  reactorRuntime: OrphanRecoveryOptions['reactorRuntime'],
  _recoveryReason: string,
): { ok: true } | { ok: false; reason: string } {
  if (!reactorRuntime) {
    return { ok: false, reason: 'reactor_runtime_unavailable' };
  }
  if (!sqlite.getRecipe) {
    return { ok: false, reason: 'sqlite_getRecipe_unavailable' };
  }
  if (!sqlite.getReactorConfig) {
    return { ok: false, reason: 'sqlite_getReactorConfig_unavailable' };
  }

  // 1. Recipe lookup
  let recipeRow: any;
  try {
    recipeRow = sqlite.getRecipe(orphan.recipe_id, orphan.recipe_version);
  } catch (e) {
    return { ok: false, reason: `recipe_lookup_threw:${(e as Error).message}` };
  }
  if (!recipeRow) {
    return { ok: false, reason: 'recipe_missing' };
  }
  const recipe = sqlite.parseRecipeRow ? sqlite.parseRecipeRow(recipeRow) : recipeRow;
  if (!recipe || !Array.isArray(recipe.phases)) {
    return { ok: false, reason: 'recipe_parse_failed' };
  }

  // 2. Reactor-config lookup — required so we know how to talk to the PLC.
  //    A missing reactor_configs row means the operator hasn't registered
  //    the reactor; we can't safely fabricate one at boot.
  let reactorConfig: any;
  try {
    reactorConfig = sqlite.getReactorConfig(orphan.reactor_id);
  } catch (e) {
    return { ok: false, reason: `reactor_config_lookup_threw:${(e as Error).message}` };
  }
  if (!reactorConfig) {
    return { ok: false, reason: 'reactor_config_missing' };
  }

  // 3. Register the reactor controller if it doesn't already exist.
  //    addReactor throws on duplicate or capacity overflow — guard with has().
  const { reactorManager, buildReactorConfig, wireReactorEvents } = reactorRuntime;
  if (!reactorManager.has(orphan.reactor_id)) {
    try {
      const cfg = buildReactorConfig(orphan.reactor_id);
      reactorManager.addReactor(orphan.reactor_id, cfg);
      wireReactorEvents(orphan.reactor_id);
    } catch (e) {
      return { ok: false, reason: `addReactor_threw:${(e as Error).message}` };
    }
  }

  const ctrl = reactorManager.getReactor(orphan.reactor_id);
  if (!ctrl) {
    return { ok: false, reason: 'reactor_controller_missing_after_add' };
  }

  // 4. Drive resumeAndStart
  try {
    const r = ctrl.resumeAndStart(orphan.batch_id, recipe, orphan.current_node_id);
    if (!r.success) {
      return { ok: false, reason: `resumeAndStart_failed:${r.message}` };
    }
  } catch (e) {
    return { ok: false, reason: `resumeAndStart_threw:${(e as Error).message}` };
  }

  return { ok: true };
}

/**
 * v1.9.0 P2 bucket 2 — assemble the input passed to RecoveryPolicy.decide().
 * Pure helper; exposed for testing convenience but not part of the public API.
 */
function buildRecoveryDecisionInput(
  db: Database.Database,
  orphan: {
    batch_id: string;
    recipe_id: string;
    recipe_version: string;
    current_state: string;
    current_phase_index: number | null;
  },
  sqlite: { getRecipe?: (recipeId: string, version?: string) => any },
): RecoveryDecisionInput {
  // prevState narrowing — getOrphanBatches only returns running/held/paused
  const prevState = orphan.current_state as 'running' | 'held' | 'paused';

  // phaseType — best-effort recipe lookup
  let phaseType: string | undefined = undefined;
  try {
    if (sqlite.getRecipe) {
      const recipe = sqlite.getRecipe(orphan.recipe_id, orphan.recipe_version);
      if (recipe) {
        // recipes.phases is JSON-encoded in SQLite; parse if it looks like a string
        let phases: any = recipe.phases;
        if (typeof phases === 'string') {
          try { phases = JSON.parse(phases); } catch { phases = null; }
        }
        const idx = orphan.current_phase_index ?? 0;
        if (Array.isArray(phases) && phases[idx]) {
          phaseType = phases[idx].type;
        }
      }
    }
  } catch {
    // recipe lookup is best-effort only; leave phaseType undefined on any failure
  }

  // ageSinceLastAuditMs — query audit_logs for the most recent timestamp.
  //
  // SQLite's `datetime('now')` writes UTC in the format 'YYYY-MM-DD HH:MM:SS'
  // (no 'T', no 'Z'). JavaScript's Date constructor treats that string as
  // *local time* on most runtimes — which on a UTC+N host produces a moment
  // N hours offset from the actual write moment, making age computations
  // wrong (often by enough to fail the conservative policy's 30s gate).
  // v1.12.0 F2-AUTO: normalize the SQLite timestamp to ISO-UTC before parsing.
  let ageSinceLastAuditMs: number | undefined = undefined;
  try {
    const row = db
      .prepare('SELECT MAX(timestamp) AS max_ts FROM audit_logs WHERE batch_id = ?')
      .get(orphan.batch_id) as { max_ts: string | null } | undefined;
    const maxTs = row?.max_ts;
    if (maxTs) {
      // SQLite TEXT timestamps from datetime('now') are UTC but lack the trailing 'Z'.
      // If the string already includes a TZ designator (Z or ±HH:MM), use it as-is;
      // otherwise treat it as UTC by appending 'Z' and converting space → 'T'.
      const tzAware = /[zZ]|[+-]\d{2}:?\d{2}$/.test(maxTs);
      const normalized = tzAware ? maxTs : `${maxTs.replace(' ', 'T')}Z`;
      const t = new Date(normalized).getTime();
      if (!Number.isNaN(t)) {
        ageSinceLastAuditMs = Date.now() - t;
      }
    }
  } catch {
    // audit_logs may not exist in test harnesses — leave undefined
  }

  // commHealthy — known limitation: at this boot stage the reactor/PLC layer
  // is not yet wired, so we conservatively report `true` (matches the "best
  // available signal" + the policy's other gates still protect us).
  const commHealthy = true;

  return { prevState, phaseType, ageSinceLastAuditMs, commHealthy };
}
