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

  it('shows red dispatch_failed toast with error message', () => {
    render(<ScadaToast />);
    act(() => {
      useRealtimeStore.setState({
        aiSuggestions: [{
          id: 10, source_module: 'scada', action: 'dispatch_failed',
          target_param: 'F01.SP-temp', suggested_value: 38, error: 'tag F01.SP-temp is read-only',
        } as any],
      } as any);
    });
    expect(screen.getByText(/SCADA 下发失败 #10/)).toBeTruthy();
    expect(screen.getByText(/F01.SP-temp 下发失败: tag F01.SP-temp is read-only/)).toBeTruthy();
  });

  it('dispatch_failed dedup is independent from created; same id can fire both', () => {
    render(<ScadaToast />);
    // first: created
    act(() => {
      useRealtimeStore.setState({
        aiSuggestions: [{ id: 20, source_module: 'scada', target_param: 'Y', suggested_value: 2 } as any],
      } as any);
    });
    expect(screen.getByText(/SCADA 建议 #20/)).toBeTruthy();
    // then: dispatch_failed (same id, different action) → second toast
    act(() => {
      useRealtimeStore.setState({
        aiSuggestions: [{ id: 20, source_module: 'scada', action: 'dispatch_failed', target_param: 'Y', suggested_value: 2, error: 'PLC offline' } as any],
      } as any);
    });
    expect(screen.getByText(/SCADA 下发失败 #20/)).toBeTruthy();
  });

  it('dispatch_failed toast auto-dismisses after 8 seconds', () => {
    render(<ScadaToast />);
    act(() => {
      useRealtimeStore.setState({
        aiSuggestions: [{ id: 30, source_module: 'scada', action: 'dispatch_failed', target_param: 'Z', error: 'timeout' } as any],
      } as any);
    });
    expect(screen.getByText(/SCADA 下发失败 #30/)).toBeTruthy();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText(/SCADA 下发失败 #30/)).toBeTruthy();  // still visible at 5s
    act(() => { vi.advanceTimersByTime(3500); });
    expect(screen.queryByText(/SCADA 下发失败 #30/)).toBeNull();   // gone after 8s
  });
});
