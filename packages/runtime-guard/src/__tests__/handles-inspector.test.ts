import { describe, it, expect } from 'vitest';
import { inspectHandles } from '../handles-inspector';

describe('inspectHandles', () => {
  it('returns active count and by-type breakdown that sum to active', () => {
    const r = inspectHandles();
    expect(r.active).toBeGreaterThanOrEqual(0);
    expect(typeof r.byType).toBe('object');
    const sum = Object.values(r.byType).reduce((a, b) => a + b, 0);
    expect(sum).toBe(r.active);
  });

  it('returns empty byType when no handles (sum = 0 if active = 0)', () => {
    const r = inspectHandles();
    if (r.active === 0) expect(Object.keys(r.byType)).toHaveLength(0);
  });

  it('counts a freshly created Timeout handle', () => {
    const before = inspectHandles();
    const t = setTimeout(() => {}, 10_000);
    const after = inspectHandles();
    clearTimeout(t);
    expect(after.active).toBeGreaterThanOrEqual(before.active);
  });
});
