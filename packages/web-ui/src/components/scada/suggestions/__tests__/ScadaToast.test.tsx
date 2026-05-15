import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useRealtimeStore } from '@/stores/realtime-store';
import { ScadaToast } from '../ScadaToast';

beforeEach(() => {
  useRealtimeStore.setState({ aiSuggestions: [] } as any);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('ScadaToast', () => {
  it('shows toast when scada-source suggestion arrives', () => {
    render(<ScadaToast />);
    act(() => {
      useRealtimeStore.setState({
        aiSuggestions: [{ id: 1, source_module: 'scada', target_param: 'F01.SP-temp', suggested_value: 38 } as any],
      } as any);
    });
    expect(screen.getByText(/F01.SP-temp = 38/)).toBeTruthy();
    expect(screen.getByText(/SCADA 建议 #1/)).toBeTruthy();
  });

  it('does NOT show toast for non-scada source', () => {
    render(<ScadaToast />);
    act(() => {
      useRealtimeStore.setState({
        aiSuggestions: [{ id: 5, source_module: 'ai_auto', target_param: 'F01.SP-pH', suggested_value: 7.2 } as any],
      } as any);
    });
    expect(screen.queryByText(/SCADA 建议 #5/)).toBeNull();
  });

  it('auto-dismisses after 5 seconds', () => {
    render(<ScadaToast />);
    act(() => {
      useRealtimeStore.setState({
        aiSuggestions: [{ id: 2, source_module: 'scada', target_param: 'X', suggested_value: 1 } as any],
      } as any);
    });
    expect(screen.getByText(/SCADA 建议 #2/)).toBeTruthy();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.queryByText(/SCADA 建议 #2/)).toBeNull();
  });
});
