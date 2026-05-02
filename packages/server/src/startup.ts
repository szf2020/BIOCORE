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
import { getOrphanBatches, markBatchHeldForRecovery } from '@biocore/data-service';

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
  sqlite: { writeAuditLog: (e: any) => void };
}

/**
 * v1.7.2: boot-time crash-recovery scan.
 * Any batch left in current_state ∈ {running, held, paused} when this server
 * process starts is by definition orphaned — its previous engine died with
 * the previous process. We do NOT auto-resume the engine; PVs may have
 * drifted, alarms may have been missed, and a 24h fermentation should not
 * silently restart unattended. Instead, mark each as 'held' with an
 * explicit recovery reason so they appear in the operator's hold queue
 * for explicit resume/abort decisions, and write an audit row each.
 */
export function runOrphanRecoveryScan(opts: OrphanRecoveryOptions): void {
  const { db, sqlite } = opts;
  try {
    const recoveryReason = `server_restart_recovery@${new Date().toISOString()}`;
    const orphans = getOrphanBatches(db);
    if (orphans.length > 0) {
      console.warn(`[BOOT] 检测到 ${orphans.length} 个遗留批次 (上次进程崩溃前未结束), 标记为 held 等待操作员处理`);
      for (const o of orphans) {
        try {
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
          console.warn(`[BOOT]   - ${o.batch_id} (reactor=${o.reactor_id}, prev_state=${o.current_state}, node=${o.current_node_id ?? 'NULL'})`);
        } catch (e) {
          console.error(`[BOOT] 标记批次 ${o.batch_id} 为 held 失败:`, (e as Error).message);
        }
      }
    } else {
      console.log('[BOOT] 无遗留批次需恢复');
    }
  } catch (e) {
    console.error('[BOOT] 崩溃恢复扫描失败 (server 仍正常启动):', (e as Error).message);
  }
}
