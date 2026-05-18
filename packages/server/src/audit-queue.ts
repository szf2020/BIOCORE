/**
 * v1.9.0 P2 bucket 3 — audit micro-queue.
 *
 * Decouples sync better-sqlite3 writeAuditLog() calls from EventEmitter
 * listener stacks. Without this, an audit write inside ctrl.on('branch_evaluated')
 * blocks the engine's readyNextPhase() loop for the duration of the SQLite
 * prepare/run (typically <1ms but can spike under contention).
 *
 * Pattern:
 *   - listener calls auditQueue.enqueue(args) — purely synchronous push, no DB I/O
 *   - drain is scheduled via setImmediate on first enqueue; subsequent enqueues
 *     coalesce into the same drain
 *   - drain runs after all current synchronous work, batches writes inside
 *     a single SQLite transaction
 *   - graceful shutdown calls auditQueue.flushSync() to drain remaining items
 *     before process.exit
 */

import type { SQLiteService } from '@biocore/data-service';
import { metricsRegistry } from './services/metrics';

type WriteAuditLogArgs = Parameters<SQLiteService['writeAuditLog']>[0];

// SP-FX-28: audit log writes counter (全局 registry 单例)
const auditWritesTotal = metricsRegistry.counter(
  'audit_log_writes_total',
  'Total number of audit log entries written to SQLite',
);

export class AuditQueue {
  private queue: WriteAuditLogArgs[] = [];
  private drainScheduled = false;
  private sqlite: SQLiteService;
  /** stats for observability — read by /admin/metrics or the health endpoint */
  public stats = { enqueued: 0, drained: 0, dropped: 0, lastDrainMs: 0 };

  constructor(sqlite: SQLiteService) {
    this.sqlite = sqlite;
  }

  enqueue(args: WriteAuditLogArgs): void {
    this.queue.push(args);
    this.stats.enqueued++;
    if (!this.drainScheduled) {
      this.drainScheduled = true;
      setImmediate(() => this.drain());
    }
  }

  /** Async drain (called by setImmediate). Wraps the batch in a transaction. */
  private drain(): void {
    this.drainScheduled = false;
    if (this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    const start = Date.now();
    try {
      const db = this.sqlite.getDatabase();
      const txn = db.transaction((rows: WriteAuditLogArgs[]) => {
        for (const row of rows) {
          this.sqlite.writeAuditLog(row);
        }
      });
      txn(batch);
      this.stats.drained += batch.length;
      // SP-FX-28: 每成功写入一条 audit log 计数加 1
      for (let i = 0; i < batch.length; i++) auditWritesTotal.inc();
    } catch (e) {
      this.stats.dropped += batch.length;
      console.error('[AUDIT] queue drain failed; ' + batch.length + ' rows dropped:', (e as Error).message);
    } finally {
      this.stats.lastDrainMs = Date.now() - start;
    }
  }

  /** Sync drain — for graceful shutdown. Returns count drained. */
  flushSync(): number {
    if (this.queue.length === 0) return 0;
    const count = this.queue.length;
    this.drain();
    return count;
  }

  /** Current queue depth — for /admin/metrics observability */
  depth(): number {
    return this.queue.length;
  }
}

let _instance: AuditQueue | null = null;

export function initAuditQueue(sqlite: SQLiteService): AuditQueue {
  if (_instance) throw new Error('audit queue already initialized');
  _instance = new AuditQueue(sqlite);
  return _instance;
}

export function getAuditQueue(): AuditQueue {
  if (!_instance) throw new Error('audit queue not initialized — call initAuditQueue(sqlite) first');
  return _instance;
}

/** Reset module-level singleton — used only in tests. */
export function _resetAuditQueueForTest(): void {
  _instance = null;
}
