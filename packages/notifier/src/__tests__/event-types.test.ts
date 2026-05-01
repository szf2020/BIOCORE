import { describe, it, expect } from 'vitest';
import { eventTypes, validatePayload } from '../event-types';

describe('event-types', () => {
  it('exposes the 5 event types in correct order', () => {
    expect(eventTypes).toEqual([
      'process_restart',
      'oom_threshold',
      'plc_disconnect_5min',
      'uncaught_exception',
      'heap_growth_anomaly',
    ]);
  });

  it('validates plc_disconnect_5min payload', () => {
    const r = validatePayload('plc_disconnect_5min', {
      reactor_id: 'R1',
      duration_min: 5.5,
      last_seen: '2026-05-01T00:00:00Z',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.reactor_id).toBe('R1');
      expect(r.data.duration_min).toBe(5.5);
    }
  });

  it('validates oom_threshold payload', () => {
    const r = validatePayload('oom_threshold', {
      rss_mb: 1638,
      threshold_mb: 1500,
      samples: 3,
    });
    expect(r.success).toBe(true);
  });

  it('validates process_restart with optional fields', () => {
    const r1 = validatePayload('process_restart', { reason: 'manual_deploy' });
    expect(r1.success).toBe(true);
    const r2 = validatePayload('process_restart', { reason: 'oom', pid: 1234, uptime_sec: 86400 });
    expect(r2.success).toBe(true);
  });

  it('validates uncaught_exception payload', () => {
    const r = validatePayload('uncaught_exception', {
      message: 'TypeError: Cannot read property',
      stack: 'at foo (bar.ts:1:2)',
      code: 'ERR_TYPE',
    });
    expect(r.success).toBe(true);
  });

  it('validates heap_growth_anomaly payload', () => {
    const r = validatePayload('heap_growth_anomaly', {
      baseline_mb: 200,
      current_mb: 600,
      growth_pct: 200,
    });
    expect(r.success).toBe(true);
  });

  it('rejects payload with wrong type', () => {
    const r = validatePayload('plc_disconnect_5min', {
      reactor_id: 'R1',
      duration_min: 'not a number',
      last_seen: '2026-05-01T00:00:00Z',
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('duration_min');
  });

  it('rejects payload with missing required field', () => {
    const r = validatePayload('plc_disconnect_5min', {
      reactor_id: 'R1',
      // duration_min missing
      last_seen: '2026-05-01T00:00:00Z',
    });
    expect(r.success).toBe(false);
  });

  it('rejects empty payload', () => {
    const r = validatePayload('plc_disconnect_5min', {});
    expect(r.success).toBe(false);
  });
});
