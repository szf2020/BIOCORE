import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useViewList } from '../useViewList';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as any).fetch = fetchMock;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useViewList', () => {
  it('fetches the project + views on mount', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ project_id: 'p1', name: 'P', views: [{ view_id: 'v1', name: 'V1', is_template: 0, display_order: 0 }] }),
    });
    const { result } = renderHook(() => useViewList('p1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.views).toHaveLength(1);
    expect(result.current.views[0].view_id).toBe('v1');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/scada/projects/p1', expect.objectContaining({ credentials: 'include' }));
  });

  it('refetch reloads', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ project_id: 'p1', name: 'P', views: [] }),
    });
    const { result } = renderHook(() => useViewList('p1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ project_id: 'p1', name: 'P', views: [{ view_id: 'v2', name: 'V2', is_template: 0, display_order: 0 }] }),
    });
    await act(async () => { await result.current.refetch(); });
    expect(result.current.views).toHaveLength(1);
  });

  it('sets error on non-OK', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const { result } = renderHook(() => useViewList('p1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
    expect(result.current.views).toEqual([]);
  });

  it('passes limit/offset query params when page/size provided', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ project_id: 'p1', name: 'P', views: [{ view_id: 'v1', name: 'V1', is_template: 0, display_order: 0 }], total: 10 }),
    });
    const { result } = renderHook(() => useViewList('p1', { page: 2, size: 12 }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/scada/projects/p1?limit=12&offset=12',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(result.current.total).toBe(10);
    expect(result.current.views).toHaveLength(1);
  });

  it('total defaults to views.length when not provided by server', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ project_id: 'p1', name: 'P', views: [{ view_id: 'v1', name: 'V', is_template: 0, display_order: 0 }] }),
    });
    const { result } = renderHook(() => useViewList('p1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.total).toBe(1);
  });
});
