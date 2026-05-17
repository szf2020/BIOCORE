// SP-FX-2: tag binding for scada-engine widgets.
// - useTagBinding: React hook wrapping the existing useTag hook.
// - readTagSnapshot: imperative read for non-React consumers.
// - writeTag: operator manual write — WS set-value with required confirmation + ack timeout.
//
// SAFETY: writeTag REQUIRES opts.confirmed === true. expression-eval and
// animation callers never set confirmed=true; only ConfirmDialog-driven UI
// flows set it after the operator approves. This is the editor-side
// enforcement layer of the "AI/auto never writes PLC" constraint.

import { useTag, type TagSnapshot as UseTagSnapshot, parseTagId } from '@/hooks';
import { useRealtimeStore, sendWsMessage } from '@/stores/realtime-store';

export type TagSnapshot = UseTagSnapshot;

export interface WriteOpts {
  confirmed?: boolean;
  reason?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 3000;

const STALE: TagSnapshot = Object.freeze({ value: null, isStale: true, ageMs: Infinity });

export function useTagBinding(tagId: string, opts?: { staleMs?: number }): TagSnapshot {
  return useTag(tagId, opts);
}

export function readTagSnapshot(tagId: string): TagSnapshot {
  const parsed = parseTagId(tagId);
  if (!parsed) return STALE;
  const s = useRealtimeStore.getState();
  if (!s.wsConnected) return { value: null, isStale: true, ageMs: Infinity };
  const reactor = (s.reactorData as any)?.[parsed.reactorId];
  if (!reactor || !reactor.processValues) return STALE;
  const v = reactor.processValues[parsed.field];
  if (v === undefined || v === null) return STALE;
  const ageMs = reactor.lastUpdateTs ? Date.now() - reactor.lastUpdateTs : Infinity;
  return { value: v as number | null, isStale: false, ageMs };
}

// ── Write path ────────────────────────────────────────────────────────────

interface PendingAck {
  resolve: () => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, PendingAck>();

function handleAck(ack: { reqId: string; ok: boolean; error?: string }): void {
  const p = pending.get(ack.reqId);
  if (!p) return;
  pending.delete(ack.reqId);
  clearTimeout(p.timer);
  if (ack.ok) p.resolve();
  else p.reject(new Error(ack.error ?? 'set-value failed'));
}

// Expose handler so SP-FX-7 WS receive loop can register; tests also use this
// to inject acks directly via (writeTag as any).__currentAckHandler.
export function registerAckHandler(fn: ((ack: { reqId: string; ok: boolean; error?: string }) => void) | null): void {
  const next = fn ?? handleAck;
  (writeTag as any).__currentAckHandler = next;
}

export async function writeTag(tagId: string, value: number | string | boolean, opts: WriteOpts = {}): Promise<void> {
  if (opts.confirmed !== true) {
    throw new Error('writeTag requires explicit confirmation (opts.confirmed=true)');
  }
  const reqId = (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
    ? (crypto as any).randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(reqId);
      reject(new Error(`writeTag timeout after ${timeoutMs}ms (reqId=${reqId})`));
    }, timeoutMs);
    pending.set(reqId, { resolve, reject, timer });
    try {
      const payload: Record<string, unknown> = { type: 'set-value', tagId, value, reqId };
      if (opts.reason) payload.reason = opts.reason;
      sendWsMessage(payload);
    } catch (e) {
      pending.delete(reqId);
      clearTimeout(timer);
      reject(e as Error);
    }
  });
}

// Attach default ack handler for test introspection
(writeTag as any).__currentAckHandler = handleAck;
