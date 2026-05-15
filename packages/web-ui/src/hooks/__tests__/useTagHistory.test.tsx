import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRealtimeStore } from '@/stores/realtime-store';
import { useTagHistory } from '../useTagHistory';

function makeTimestamps(count: number, intervalSec = 1, anchor?: number): string[] {
  const start = anchor ?? (Date.now() - count * intervalSec * 1000);
  return Array.from({ length: count }, (_, i) =>
    new Date(start + i * intervalSec * 1000).toISOString()
  );
}

function seedTrend(reactorId: string, trend: {
  timestamps: string[];
  temperature?: number[];
  pH?: number[];
  DO?: number[];
  rpm?: number[];
  airflow?: number[];
}) {
  const filled = {
    timestamps: trend.timestamps,
    temperature: trend.temperature ?? [],
    pH: trend.pH ?? [],
    DO: trend.DO ?? [],
    rpm: trend.rpm ?? [],
    airflow: trend.airflow ?? [],
  };
  useRealtimeStore.setState({
    wsConnected: true,
    _tick: Date.now(),
    reactorData: {
      [reactorId]: {
        processValues: { timestamp: trend.timestamps[trend.timestamps.length - 1] ?? new Date().toISOString() } as any,
        stateUpdate: null,
        calculatedParams: null,
        alarms: [],
        cusumAlerts: [],
        cusumHistory: {},
        softSensorData: null,
        trendBuffer: filled,
      },
    },
  });
}

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

describe('useTagHistory', () => {
  const NOW = new Date('2026-05-15T12:00:00Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    resetStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. store 注 60 点, windowSec=60 → points.length = 60', () => {
    const timestamps = makeTimestamps(60, 1, NOW - 60 * 1000);
    const temperature = Array.from({ length: 60 }, (_, i) => 37 + i * 0.01);
    seedTrend('F01', { timestamps, temperature });
    const { result } = renderHook(() => useTagHistory('F01.AI-0', { windowSec: 60 }));
    expect(result.current.points.length).toBe(60);
    expect(result.current.isStale).toBe(false);
  });

  it('2. windowSec huge → clamp 到现有点数', () => {
    const timestamps = makeTimestamps(100, 1, NOW - 100 * 1000);
    const temperature = Array.from({ length: 100 }, (_, i) => i);
    seedTrend('F01', { timestamps, temperature });
    const { result } = renderHook(() => useTagHistory('F01.AI-0', { windowSec: 99999 }));
    expect(result.current.points.length).toBe(100);
  });

  it('3. reactor 未连 → points=[], isStale=true', () => {
    const { result } = renderHook(() => useTagHistory('F99.AI-0', { windowSec: 60 }));
    expect(result.current.points).toEqual([]);
    expect(result.current.isStale).toBe(true);
  });

  it('4. field 映射: AI-0→temperature, AI-2→pH; AI-1 不在 mapping → []', () => {
    const timestamps = makeTimestamps(5, 1, NOW - 5 * 1000);
    seedTrend('F01', {
      timestamps,
      temperature: [10, 11, 12, 13, 14],
      pH: [7.0, 7.1, 7.2, 7.3, 7.4],
    });

    const { result: r1 } = renderHook(() => useTagHistory('F01.AI-0', { windowSec: 60 }));
    expect(r1.current.points.map((p) => p.v)).toEqual([10, 11, 12, 13, 14]);

    const { result: r2 } = renderHook(() => useTagHistory('F01.AI-2', { windowSec: 60 }));
    expect(r2.current.points.map((p) => p.v)).toEqual([7.0, 7.1, 7.2, 7.3, 7.4]);

    const { result: r3 } = renderHook(() => useTagHistory('F01.AI-1', { windowSec: 60 }));
    expect(r3.current.points).toEqual([]);
  });

  it('5. windowSec=0 → points=[]', () => {
    const timestamps = makeTimestamps(10, 1, NOW - 10 * 1000);
    seedTrend('F01', { timestamps, temperature: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });
    const { result } = renderHook(() => useTagHistory('F01.AI-0', { windowSec: 0 }));
    expect(result.current.points).toEqual([]);
  });

  it('6. points 按 t 升序', () => {
    const timestamps = makeTimestamps(10, 1, NOW - 10 * 1000);
    seedTrend('F01', { timestamps, temperature: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19] });
    const { result } = renderHook(() => useTagHistory('F01.AI-0', { windowSec: 60 }));
    const pts = result.current.points;
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].t).toBeGreaterThan(pts[i - 1].t);
    }
  });
});
