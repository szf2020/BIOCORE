import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRealtimeStore } from '@/stores/realtime-store';
import { useTag } from '../useTag';

function resetStore() {
  useRealtimeStore.setState({
    wsConnected: false,
    _tick: 0,
    reactorData: {},
    processValues: null,
    stateUpdate: null,
    calculatedParams: null,
    alarms: [],
    cusumAlerts: [],
    cusumHistory: {},
    heartbeatStatus: null,
    stepProgress: null,
    aiSuggestions: [],
    softSensorData: null,
    reactorStates: {},
    reactorRecipes: {},
    trendBuffer: { timestamps: [], temperature: [], pH: [], DO: [], rpm: [], airflow: [] },
    batchRuntime: {},
    recentBranchEvaluations: [],
  });
}

function seedReactor(opts: {
  reactorId?: string;
  processValues?: any;
  wsConnected?: boolean;
  now?: number;
}) {
  const {
    reactorId = 'F01',
    processValues = null,
    wsConnected = true,
    now = Date.now(),
  } = opts;
  useRealtimeStore.setState({
    wsConnected,
    _tick: now,
    reactorData: {
      [reactorId]: {
        processValues,
        stateUpdate: null,
        calculatedParams: null,
        alarms: [],
        cusumAlerts: [],
        cusumHistory: {},
        softSensorData: null,
        trendBuffer: { timestamps: [], temperature: [], pH: [], DO: [], rpm: [], airflow: [] },
      },
    },
  });
}

describe('useTag', () => {
  beforeEach(() => {
    resetStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. 合法 tag + 新鲜值 → value 正确 isStale=false ageMs 小', () => {
    const now = new Date('2026-05-15T10:00:00Z').getTime();
    vi.setSystemTime(now);
    seedReactor({
      processValues: { timestamp: '2026-05-15T10:00:00Z', 'AI-0': 37.5, batch_id: 'b1' },
      now,
    });
    const { result } = renderHook(() => useTag('F01.AI-0'));
    expect(result.current.value).toBe(37.5);
    expect(result.current.isStale).toBe(false);
    expect(result.current.ageMs).toBeLessThan(1000);
  });

  it('2. age > staleMs → isStale=true', () => {
    const start = new Date('2026-05-15T10:00:00Z').getTime();
    vi.setSystemTime(start);
    seedReactor({
      processValues: { timestamp: '2026-05-15T10:00:00Z', 'AI-0': 37.5 },
      now: start,
    });
    vi.setSystemTime(start + 10_000);
    act(() => {
      useRealtimeStore.setState({ _tick: start + 10_000 });
    });
    const { result } = renderHook(() => useTag('F01.AI-0'));
    expect(result.current.value).toBe(37.5);
    expect(result.current.isStale).toBe(true);
    expect(result.current.ageMs).toBeGreaterThanOrEqual(10_000);
  });

  it('3. tagId 缺 "." → null + stale', () => {
    seedReactor({ processValues: { timestamp: new Date().toISOString(), 'AI-0': 37.5 } });
    const { result } = renderHook(() => useTag('F01AI0'));
    expect(result.current.value).toBeNull();
    expect(result.current.isStale).toBe(true);
    expect(result.current.ageMs).toBe(Infinity);
  });

  it('4. tagId 多于一个 "." → null + stale', () => {
    seedReactor({ processValues: { timestamp: new Date().toISOString(), 'AI-0': 37.5 } });
    const { result } = renderHook(() => useTag('F01.AI.0'));
    expect(result.current.value).toBeNull();
    expect(result.current.isStale).toBe(true);
  });

  it('5. field 不在 ProcessValues 白名单 → null + stale', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    seedReactor({
      processValues: { timestamp: new Date(now).toISOString(), 'AI-0': 37.5 },
      now,
    });
    const { result } = renderHook(() => useTag('F01.UNKNOWN_FIELD'));
    expect(result.current.value).toBeNull();
    expect(result.current.isStale).toBe(true);
  });

  it('6. reactorData[rid] undefined → null + stale', () => {
    seedReactor({
      reactorId: 'F01',
      processValues: { timestamp: new Date().toISOString(), 'AI-0': 1 },
    });
    const { result } = renderHook(() => useTag('F99.AI-0'));
    expect(result.current.value).toBeNull();
    expect(result.current.isStale).toBe(true);
    expect(result.current.ageMs).toBe(Infinity);
  });

  it('7. processValues=null → null + stale', () => {
    seedReactor({ processValues: null, wsConnected: true });
    const { result } = renderHook(() => useTag('F01.AI-0'));
    expect(result.current.value).toBeNull();
    expect(result.current.isStale).toBe(true);
  });

  it('8. wsConnected=false → 强制 isStale=true 即使 ageMs 小', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    seedReactor({
      processValues: { timestamp: new Date(now).toISOString(), 'AI-0': 37.5 },
      now,
      wsConnected: false,
    });
    const { result } = renderHook(() => useTag('F01.AI-0'));
    expect(result.current.value).toBe(37.5);
    expect(result.current.isStale).toBe(true);
  });

  it('9. staleMs 自定义 10000 → 5s 后仍不 stale', () => {
    const start = Date.now();
    vi.setSystemTime(start);
    seedReactor({
      processValues: { timestamp: new Date(start).toISOString(), 'AI-0': 37.5 },
      now: start,
    });
    vi.setSystemTime(start + 5_000);
    act(() => {
      useRealtimeStore.setState({ _tick: start + 5_000 });
    });
    const { result } = renderHook(() => useTag('F01.AI-0', { staleMs: 10_000 }));
    expect(result.current.value).toBe(37.5);
    expect(result.current.isStale).toBe(false);
  });

  it('10. tick 触发后 ageMs 涨', () => {
    const start = Date.now();
    vi.setSystemTime(start);
    seedReactor({
      processValues: { timestamp: new Date(start).toISOString(), 'AI-0': 37.5 },
      now: start,
    });
    const { result } = renderHook(() => useTag('F01.AI-0'));
    expect(result.current.ageMs).toBeLessThan(1000);

    vi.setSystemTime(start + 2_000);
    act(() => {
      useRealtimeStore.setState({ _tick: start + 2_000 });
    });
    expect(result.current.ageMs).toBeGreaterThanOrEqual(2_000);
  });
});
