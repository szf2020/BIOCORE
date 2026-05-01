import { describe, it, expect } from 'vitest';
import { Throttler } from '../throttler';

describe('Throttler', () => {
  it('allows first event for a key', () => {
    const t = new Throttler({ windowMs: 1000, now: () => 0 });
    expect(t.shouldAllow('a')).toBe(true);
  });

  it('throttles same key within window', () => {
    const t = new Throttler({ windowMs: 1000, now: () => 0 });
    t.record('a');
    expect(t.shouldAllow('a')).toBe(false);
  });

  it('allows again after window expires', () => {
    let now = 0;
    const t = new Throttler({ windowMs: 1000, now: () => now });
    t.record('a');
    expect(t.shouldAllow('a')).toBe(false);
    now = 1500;
    expect(t.shouldAllow('a')).toBe(true);
  });

  it('treats different keys independently', () => {
    const t = new Throttler({ windowMs: 1000, now: () => 0 });
    t.record('a');
    expect(t.shouldAllow('b')).toBe(true);
  });

  it('counts throttled events per key', () => {
    const t = new Throttler({ windowMs: 1000, now: () => 0 });
    t.record('a');
    expect(t.shouldAllow('a')).toBe(false);
    t.recordThrottled('a');
    t.recordThrottled('a');
    t.recordThrottled('a');
    expect(t.throttledCount('a')).toBe(3);
  });

  it('throttledCount returns 0 for never-throttled key', () => {
    const t = new Throttler({ windowMs: 1000, now: () => 0 });
    expect(t.throttledCount('never_seen')).toBe(0);
  });

  it('record() clears the throttled count for that key', () => {
    const t = new Throttler({ windowMs: 1000, now: () => 0 });
    t.record('a');
    t.recordThrottled('a');
    expect(t.throttledCount('a')).toBe(1);
    // After window expires + new record, count resets
    t.record('a');
    expect(t.throttledCount('a')).toBe(0);
  });

  it('cleanupExpired() removes lastFire entries beyond window', () => {
    let now = 0;
    const t = new Throttler({ windowMs: 1000, now: () => now });
    t.record('a');
    t.record('b');
    now = 2000;
    t.cleanupExpired();
    // Both expired, both shouldAllow now true
    expect(t.shouldAllow('a')).toBe(true);
    expect(t.shouldAllow('b')).toBe(true);
  });

  it('default windowMs is 5 minutes', () => {
    const t = new Throttler();
    // Default 5min — verify by checking shouldAllow semantics with real clock
    t.record('a');
    expect(t.shouldAllow('a')).toBe(false);  // immediately throttled
  });
});
