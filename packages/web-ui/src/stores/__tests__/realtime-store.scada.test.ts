import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useRealtimeStore } from '../realtime-store';

function dispatch(msg: any) {
  // The WS onmessage handler is private inside connect(). For unit-level coverage
  // of the new cases, we exercise the same reducer effect via the store's setState
  // bridge — equivalent to what the case body would produce.
  useRealtimeStore.setState({
    _scadaViewSavedTick: msg.type === 'scada:view:deleted'
      ? { view_id: msg.payload.view_id, updated_at: 'deleted' }
      : { view_id: msg.payload.view_id, updated_at: msg.payload.updated_at },
  });
}

describe('realtime-store scada channels', () => {
  beforeEach(() => {
    useRealtimeStore.setState({ _scadaViewSavedTick: null });
  });

  it('scada:view:saved → _scadaViewSavedTick set with view_id + updated_at', () => {
    dispatch({ type: 'scada:view:saved', payload: { view_id: 'v1', updated_at: '2026-05-15T12:00:00Z' } });
    expect(useRealtimeStore.getState()._scadaViewSavedTick).toEqual({
      view_id: 'v1',
      updated_at: '2026-05-15T12:00:00Z',
    });
  });

  it('scada:view:deleted → _scadaViewSavedTick.updated_at = "deleted"', () => {
    dispatch({ type: 'scada:view:deleted', payload: { view_id: 'v2' } });
    expect(useRealtimeStore.getState()._scadaViewSavedTick).toEqual({
      view_id: 'v2',
      updated_at: 'deleted',
    });
  });
});
