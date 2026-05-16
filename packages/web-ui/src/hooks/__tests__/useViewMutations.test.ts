import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useViewMutations } from '../useViewMutations';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as any).fetch = fetchMock;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useViewMutations', () => {
  it('create POSTs to /scada/projects/:projectId/views with body shape', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ view_id: 'new-id', success: true }) });
    const { result } = renderHook(() => useViewMutations('p1'));
    await act(async () => {
      await result.current.create('My View', { cloneFrom: 't1' });
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/scada/projects/p1/views',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as any).body);
    expect(body.name).toBe('My View');
    expect(body.clone_from).toBe('t1');
    expect(typeof body.view_id).toBe('string');
    expect(body.view_id.length).toBeGreaterThan(0);
  });

  it('rename PUTs name to /scada/views/:viewId', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ updated_at: 'now' }) });
    const { result } = renderHook(() => useViewMutations('p1'));
    await act(async () => { await result.current.rename('v1', 'New Name'); });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/scada/views/v1',
      expect.objectContaining({ method: 'PUT' }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as any).body);
    expect(body.name).toBe('New Name');
  });

  it('delete DELETEs /scada/views/:viewId', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true }) });
    const { result } = renderHook(() => useViewMutations('p1'));
    await act(async () => { await result.current.delete('v1'); });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/scada/views/v1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('reorder sends a single PATCH with the ordered ids to the project endpoint', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, count: 3 }) });
    const { result } = renderHook(() => useViewMutations('p1'));
    await act(async () => { await result.current.reorder(['v3', 'v1', 'v2']); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/api/v1/scada/projects/p1/views/order');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ ordered_view_ids: ['v3', 'v1', 'v2'] });
  });
});
