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
  type RecoveryPolicy,
  type RecoveryDecisionInput,
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
  };
  /**
   * v1.9.0 P2 bucket 2: pluggable decision strategy.
   * Default = `defaultRecoveryPolicy` (always-hold, preserves v1.7.2 behavior).
   * Caller in index.ts may pass a custom policy once F2-AUTO is implemented.
   */
  policy?: RecoveryPolicy;
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
  const { db, sqlite, policy = defaultRecoveryPolicy } = opts;
  try {
    const recoveryReason = `server_restart_recovery@${new Date().toISOString()}`;
    const orphans = getOrphanBatches(db);
    if (orphans.length === 0) {
      console.log('[BOOT] 无遗留批次需恢复');
      return;
    }

    console.warn(`[BOOT] 检测到 ${orphans.length} 个遗留批次 (上次进程崩溃前未结束), 通过 RecoveryPolicy 决策处理`);

    let heldCount = 0;
    let autoResumeDeferredCount = 0;
    let abortedCount = 0;

    for (const o of orphans) {
      try {
        // Build the decision input
        const input = buildRecoveryDecisionInput(db, o, sqlite);
        const decision = policy.decide(input);

        if (decision === 'auto_resume') {
          // F2-AUTO not yet implemented — fall back to hold for safety, but
          // record the deferred decision so future telemetry can spot it.
          console.warn(
            `[BOOT] policy returned 'auto_resume' for batch ${o.batch_id} but auto-resume execution is not yet implemented (F2-AUTO); falling back to hold`,
          );
          markBatchHeldForRecovery(db, o.batch_id, recoveryReason);
          sqlite.writeAuditLog({
            user_id: 'system',
            action: 'batch_held_recovery_auto_resume_deferred',
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
              decision_input: input,
            }),
          });
          autoResumeDeferredCount++;
          console.warn(`[BOOT]   - ${o.batch_id} (reactor=${o.reactor_id}, prev_state=${o.current_state}, decision=auto_resume→hold)`);
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

    console.log(`[BOOT] orphan recovery: ${heldCount} held, ${autoResumeDeferredCount} auto_resume_deferred, ${abortedCount} aborted`);
  } catch (e) {
    console.error('[BOOT] 崩溃恢复扫描失败 (server 仍正常启动):', (e as Error).message);
  }
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

  // ageSinceLastAuditMs — query audit_logs for the most recent timestamp
  let ageSinceLastAuditMs: number | undefined = undefined;
  try {
    const row = db
      .prepare('SELECT MAX(timestamp) AS max_ts FROM audit_logs WHERE batch_id = ?')
      .get(orphan.batch_id) as { max_ts: string | null } | undefined;
    const maxTs = row?.max_ts;
    if (maxTs) {
      const t = new Date(maxTs).getTime();
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
