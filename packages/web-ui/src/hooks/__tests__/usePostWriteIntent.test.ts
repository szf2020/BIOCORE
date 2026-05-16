import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePostWriteIntent } from '../usePostWriteIntent';

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); (globalThis as any).fetch = fetchMock; });
afterEach(() => { vi.restoreAllMocks(); });

describe('usePostWriteIntent', () => {
  it('POSTs to /api/v1/scada/write-intents with correct body shape', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, suggestion_id: 42 }) });
    const { result } = renderHook(() => usePostWriteIntent());
    await act(async () => {
      await result.current.post({ tag: 't1', value: 1, reason: 'Refill', view_id: 'v1', widget_id: 'w1' });
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/scada/write-intents',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as any).body);
    expect(body).toEqual({ tag: 't1', value: 1, reason: 'Refill', view_id: 'v1', widget_id: 'w1' });
  });

  it('returns suggestion_id on success', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, suggestion_id: 7 }) });
    const { result } = renderHook(() => usePostWriteIntent());
    let r: any;
    await act(async () => {
      r = await result.current.post({ tag: 't1', value: 1, reason: 'ok', view_id: 'v1', widget_id: 'w1' });
    });
    expect(r.suggestion_id).toBe(7);
  });

  it('throws on non-OK with server error code', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: 'no_active_batch' }) });
    const { result } = renderHook(() => usePostWriteIntent());
    await expect(async () => {
      await act(async () => {
        await result.current.post({ tag: 't1', value: 1, reason: 'ok', view_id: 'v1', widget_id: 'w1' });
      });
    }).rejects.toThrow(/no_active_batch/);
  });
});
