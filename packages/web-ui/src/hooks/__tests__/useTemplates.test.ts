import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTemplates } from '../useTemplates';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as any).fetch = fetchMock;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useTemplates', () => {
  it('fetches the templates list on mount', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [{ view_id: 't1', name: 'T1', is_template: 1, display_order: 0 }] }),
    });
    const { result } = renderHook(() => useTemplates('p1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.templates).toHaveLength(1);
    expect(result.current.templates[0].view_id).toBe('t1');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/scada/projects/p1/templates', expect.objectContaining({ credentials: 'include' }));
  });

  it('handles empty templates list', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) });
    const { result } = renderHook(() => useTemplates('p1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.templates).toEqual([]);
  });
});
