import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useRealtimeStore } from '@/stores/realtime-store';
import * as rtStore from '@/stores/realtime-store';
import { readTagSnapshot, writeTag } from '../tag-binding';

vi.mock('@/stores/realtime-store', async (importActual) => {
  const actual = await importActual<typeof rtStore>();
  return {
    ...actual,
    sendWsMessage: vi.fn(),
    useRealtimeStore: actual.useRealtimeStore,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  useRealtimeStore.setState({
    _tick: 0,
    wsConnected: true,
    reactorData: {
      F01: {
        processValues: { 'AI-0': 42 } as any,
        lastUpdateTs: Date.now(),
      } as any,
    },
  } as any);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('tag-binding readTagSnapshot (SP-FX-2)', () => {
  it('returns the current value for an existing tag', () => {
    const snap = readTagSnapshot('F01.AI-0');
    expect(snap.value).toBe(42);
    expect(snap.isStale).toBe(false);
  });

  it('returns null + isStale for unknown reactor', () => {
    const snap = readTagSnapshot('F99.AI-0');
    expect(snap.value).toBeNull();
    expect(snap.isStale).toBe(true);
  });

  it('returns null + isStale for unknown field', () => {
    const snap = readTagSnapshot('F01.MISSING');
    expect(snap.value).toBeNull();
    expect(snap.isStale).toBe(true);
  });

  it('returns isStale when ws disconnected even with cached value', () => {
    useRealtimeStore.setState({ wsConnected: false } as any);
    const snap = readTagSnapshot('F01.AI-0');
    expect(snap.isStale).toBe(true);
  });
});

describe('tag-binding writeTag (SP-FX-2)', () => {
  it('rejects when opts.confirmed is missing or false', async () => {
    await expect(writeTag('F01.AO-0_cv', 50)).rejects.toThrow(/confirmation/i);
    await expect(writeTag('F01.AO-0_cv', 50, {})).rejects.toThrow(/confirmation/i);
    await expect(writeTag('F01.AO-0_cv', 50, { confirmed: false })).rejects.toThrow(/confirmation/i);
  });

  it('sends a set-value WS message with reqId and payload', async () => {
    const promise = writeTag('F01.AO-0_cv', 50, { confirmed: true, reason: 'operator manual' });
    const sentMsg = (rtStore.sendWsMessage as any).mock.calls[0][0];
    expect(sentMsg.type).toBe('set-value');
    expect(sentMsg.tagId).toBe('F01.AO-0_cv');
    expect(sentMsg.value).toBe(50);
    expect(sentMsg.reason).toBe('operator manual');
    expect(typeof sentMsg.reqId).toBe('string');
    expect(sentMsg.reqId.length).toBeGreaterThan(0);
    const handler = (writeTag as any).__currentAckHandler;
    handler({ reqId: sentMsg.reqId, ok: true });
    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects when sendWsMessage throws (WS disconnected)', async () => {
    (rtStore.sendWsMessage as any).mockImplementationOnce(() => {
      throw new Error('WebSocket not connected');
    });
    await expect(writeTag('F01.AO-0_cv', 50, { confirmed: true })).rejects.toThrow(/not connected/i);
  });

  it('rejects after ack timeout (timeoutMs)', async () => {
    vi.useFakeTimers();
    const promise = writeTag('F01.AO-0_cv', 50, { confirmed: true, timeoutMs: 100 });
    vi.advanceTimersByTime(101);
    await expect(promise).rejects.toThrow(/timeout/i);
    vi.useRealTimers();
  });

  it('rejects when server ack ok:false', async () => {
    const promise = writeTag('F01.AO-0_cv', 50, { confirmed: true });
    const sentMsg = (rtStore.sendWsMessage as any).mock.calls[0][0];
    const handler = (writeTag as any).__currentAckHandler;
    handler({ reqId: sentMsg.reqId, ok: false, error: 'permission denied' });
    await expect(promise).rejects.toThrow(/permission denied/);
  });
});
