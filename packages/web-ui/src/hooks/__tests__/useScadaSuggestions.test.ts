import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRealtimeStore } from '@/stores/realtime-store';
import { useScadaSuggestions } from '../useScadaSuggestions';
import * as api from '@/api/scada';

beforeEach(() => {
  useRealtimeStore.setState({ aiSuggestions: [] } as any);
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const sample = (id: number, overrides: Partial<api.ScadaSuggestion> = {}): api.ScadaSuggestion => ({
  id,
  batch_id: 'b1',
  suggestion_type: 'widget_button',
  source_module: 'scada',
  target_param: 'F01.SP-temp',
  current_value: null,
  suggested_value: 38,
  confidence: null,
  reasoning: '{}',
  status: 'pending',
  created_at: '2026-05-15T00:00:00Z',
  expires_at: null,
  decided_by: null,
  decided_at: null,
  ...overrides,
});

describe('useScadaSuggestions', () => {
  it('fetches on mount via fetchScadaSuggestions', async () => {
    const spy = vi.spyOn(api, 'fetchScadaSuggestions').mockResolvedValue([sample(1)]);
    const { result } = renderHook(() => useScadaSuggestions());
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.suggestions.length).toBe(1));
  });

  it('accept(id) POSTs and removes from list', async () => {
    vi.spyOn(api, 'fetchScadaSuggestions').mockResolvedValue([sample(1), sample(2)]);
    const acceptSpy = vi.spyOn(api, 'acceptSuggestion').mockResolvedValue({ success: true });
    const { result } = renderHook(() => useScadaSuggestions());
    await waitFor(() => expect(result.current.suggestions.length).toBe(2));
    await act(async () => { await result.current.accept(1); });
    expect(acceptSpy).toHaveBeenCalledWith(1);
    expect(result.current.suggestions.map((s) => s.id)).toEqual([2]);
  });

  it('reject(id) POSTs and removes from list', async () => {
    vi.spyOn(api, 'fetchScadaSuggestions').mockResolvedValue([sample(7)]);
    const rejectSpy = vi.spyOn(api, 'rejectSuggestion').mockResolvedValue({ success: true });
    const { result } = renderHook(() => useScadaSuggestions());
    await waitFor(() => expect(result.current.suggestions.length).toBe(1));
    await act(async () => { await result.current.reject(7); });
    expect(rejectSpy).toHaveBeenCalledWith(7);
    expect(result.current.suggestions.length).toBe(0);
  });

  it('store aiSuggestions head update → debounced refetch after 500ms', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchScadaSuggestions').mockResolvedValue([]);
    renderHook(() => useScadaSuggestions());
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    act(() => {
      useRealtimeStore.setState({
        aiSuggestions: [
          { id: 99, source_module: 'scada', target_param: 'F01.SP-temp', suggested_value: 42 } as any,
        ],
      } as any);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(500); });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
  });
});
