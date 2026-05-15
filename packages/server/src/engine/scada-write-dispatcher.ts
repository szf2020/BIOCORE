import type { PlcWriter } from './plc-writer';

const MAX_RETRIES = 3;
const BATCH_SIZE = 10;
const PERMANENT_CODES = new Set(['NO_MAPPING', 'NO_CONNECTION', 'READ_ONLY', 'NULL_VALUE', 'OUT_OF_RANGE']);

export class DispatchError extends Error {
  constructor(public code: string, msg: string) {
    super(msg);
    this.name = 'DispatchError';
  }
}

interface MappingManagerShape {
  getVariables(): Array<{
    id: string; tag_name: string; plc_address: string; data_type: string;
    direction: string; scaling_enabled: number; eng_min: number; eng_max: number;
    connection_id: string; enabled?: number;
  }>;
  getConnections(): Array<{
    id: string; protocol: string; ip?: string; rack?: number; slot?: number; s7_db?: number;
  }>;
}

interface SQLiteShape {
  claimPendingDispatches(limit: number): any[];
  markDispatched(id: number): void;
  markDispatchFailed(id: number, err: string): void;
  incrementDispatchRetry(id: number): void;
  rollbackInProgressDispatches(): void;
  writeAuditLog(log: any): void;
}

export interface DispatcherDeps {
  sqlite: SQLiteShape;
  broadcast: (channel: string, payload: any) => void;
  writerFactory: (protocol: string) => PlcWriter;
  mappingManager: MappingManagerShape;
}

export async function dispatchTick(deps: DispatcherDeps): Promise<void> {
  const claimed = deps.sqlite.claimPendingDispatches(BATCH_SIZE);
  for (const row of claimed) {
    await dispatchOne(row, deps);
  }
}

const DEFAULT_TICK_MS = 500;

export interface DispatcherHandle { stop(): void; }

export function startScadaWriteDispatcher(
  deps: DispatcherDeps & { tickMs?: number }
): DispatcherHandle {
  deps.sqlite.rollbackInProgressDispatches();
  const tickMs = deps.tickMs ?? DEFAULT_TICK_MS;
  const timer = setInterval(() => {
    dispatchTick(deps).catch((err) => {
      console.error('[scada-dispatcher] tick error:', err);
    });
  }, tickMs);
  return { stop: () => clearInterval(timer) };
}

async function dispatchOne(row: any, deps: DispatcherDeps): Promise<void> {
  try {
    const mapping = deps.mappingManager.getVariables().find((v) => v.tag_name === row.target_param);
    if (!mapping) throw new DispatchError('NO_MAPPING', `no mapping for tag ${row.target_param}`);
    if (mapping.direction !== 'write') throw new DispatchError('READ_ONLY', `tag ${row.target_param} is read-only`);
    if (row.suggested_value == null) throw new DispatchError('NULL_VALUE', 'suggested_value is null');
    if (
      mapping.scaling_enabled &&
      (row.suggested_value < mapping.eng_min || row.suggested_value > mapping.eng_max)
    ) {
      throw new DispatchError('OUT_OF_RANGE', `${row.suggested_value} out of [${mapping.eng_min},${mapping.eng_max}]`);
    }
    const conn = deps.mappingManager.getConnections().find((c) => c.id === mapping.connection_id);
    if (!conn) throw new DispatchError('NO_CONNECTION', `connection ${mapping.connection_id} not found`);

    const writer = deps.writerFactory(conn.protocol);
    await writer.write(conn as any, mapping as any, row.suggested_value);

    deps.sqlite.markDispatched(row.id);
    deps.broadcast('ai_suggestion', {
      id: row.id, action: 'dispatched', source_module: 'scada',
      target_param: row.target_param, suggested_value: row.suggested_value,
    });
    deps.sqlite.writeAuditLog({
      user_id: row.decided_by ?? 'system',
      action: 'ai_suggestion_dispatched',
      target_type: 'ai_suggestion',
      target_id: String(row.id),
      new_value: JSON.stringify({ tag: row.target_param, value: row.suggested_value }),
    });
  } catch (e) {
    const err = e as Error;
    const isPermanent = err instanceof DispatchError && PERMANENT_CODES.has(err.code);
    const nextRetry = (row.dispatch_retry_count ?? 0) + 1;
    if (isPermanent || nextRetry >= MAX_RETRIES) {
      deps.sqlite.markDispatchFailed(row.id, err.message);
      deps.broadcast('ai_suggestion', {
        id: row.id, action: 'dispatch_failed', source_module: 'scada', error: err.message,
      });
      deps.sqlite.writeAuditLog({
        user_id: row.decided_by ?? 'system',
        action: 'ai_suggestion_dispatch_failed',
        target_type: 'ai_suggestion',
        target_id: String(row.id),
        new_value: JSON.stringify({ error: err.message, retry: nextRetry }),
      });
    } else {
      deps.sqlite.incrementDispatchRetry(row.id);
    }
  }
}
