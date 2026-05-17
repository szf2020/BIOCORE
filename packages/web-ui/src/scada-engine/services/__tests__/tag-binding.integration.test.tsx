import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useRealtimeStore } from '@/stores/realtime-store';
import { useTagBinding, __clearPendingForTests } from '../tag-binding';

function TagDisplay({ tagId }: { tagId: string }) {
  const { value, isStale } = useTagBinding(tagId);
  return (
    <div>
      <span data-testid="value">{value === null ? '—' : String(value)}</span>
      <span data-testid="stale">{isStale ? 'stale' : 'fresh'}</span>
    </div>
  );
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
  } as any);
}

describe('tag-binding integration (SP-FX-2)', () => {
  beforeEach(() => {
    resetStore();
    __clearPendingForTests();
    useRealtimeStore.setState({
      wsConnected: true,
      _tick: Date.now(),
      reactorData: {
        F01: {
          processValues: { 'AI-0': 25, timestamp: new Date().toISOString() } as any,
          lastUpdateTs: Date.now(),
        } as any,
      },
    } as any);
  });

  afterEach(() => {
    __clearPendingForTests();
  });

  it('renders the current tag value on mount', () => {
    render(<TagDisplay tagId="F01.AI-0" />);
    expect(screen.getByTestId('value').textContent).toBe('25');
    expect(screen.getByTestId('stale').textContent).toBe('fresh');
  });

  it('rerenders when realtime-store pushes a new value via _tick', () => {
    render(<TagDisplay tagId="F01.AI-0" />);
    act(() => {
      useRealtimeStore.setState({
        _tick: Date.now(),
        reactorData: {
          F01: {
            processValues: { 'AI-0': 37, timestamp: new Date().toISOString() } as any,
            lastUpdateTs: Date.now(),
          } as any,
        },
      } as any);
    });
    expect(screen.getByTestId('value').textContent).toBe('37');
  });

  it('flips to stale when ws disconnects', () => {
    render(<TagDisplay tagId="F01.AI-0" />);
    expect(screen.getByTestId('stale').textContent).toBe('fresh');
    act(() => {
      useRealtimeStore.setState({ wsConnected: false } as any);
    });
    expect(screen.getByTestId('stale').textContent).toBe('stale');
  });

  it('shows — for unknown tagId without throwing', () => {
    render(<TagDisplay tagId="F99.MISSING" />);
    expect(screen.getByTestId('value').textContent).toBe('—');
    expect(screen.getByTestId('stale').textContent).toBe('stale');
  });

  it('multiple useTagBinding instances stay isolated', () => {
    useRealtimeStore.setState({
      reactorData: {
        F01: {
          processValues: { 'AI-0': 10, 'AI-1': 20, timestamp: new Date().toISOString() } as any,
          lastUpdateTs: Date.now(),
        } as any,
      },
    } as any);
    render(
      <>
        <TagDisplay tagId="F01.AI-0" />
        <TagDisplay tagId="F01.AI-1" />
      </>,
    );
    const values = screen.getAllByTestId('value').map(n => n.textContent);
    expect(values).toEqual(['10', '20']);
  });
});
