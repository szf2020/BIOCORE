import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { matchRange, applyActions, createActionRuntime, teardownActions } from '../runtime-helpers';

describe('matchRange', () => {
  it('returns null for empty ranges', () => {
    expect(matchRange(5, [])).toBeNull();
    expect(matchRange(5, undefined)).toBeNull();
    expect(matchRange(5, null)).toBeNull();
  });

  it('returns null for non-numeric values', () => {
    expect(matchRange('abc', [{ min: 0, max: 10 }])).toBeNull();
    expect(matchRange(null, [{ min: 0, max: 10 }])).toBeNull();
  });

  it('returns first matching range (inclusive bounds)', () => {
    const ranges = [
      { min: 0, max: 10, color: 'green' },
      { min: 10, max: 20, color: 'yellow' },
    ];
    expect(matchRange(5, ranges)?.color).toBe('green');
    expect(matchRange(10, ranges)?.color).toBe('green');
    expect(matchRange(15, ranges)?.color).toBe('yellow');
  });

  it('returns null when no range matches', () => {
    expect(matchRange(50, [{ min: 0, max: 10 }])).toBeNull();
  });

  it('skips ranges with non-finite bounds', () => {
    const ranges = [
      { min: NaN, max: 10, color: 'bad' },
      { min: 0, max: 10, color: 'good' },
    ];
    expect(matchRange(5, ranges)?.color).toBe('good');
  });
});

describe('applyActions', () => {
  let element: SVGRectElement;
  let rt: ReturnType<typeof createActionRuntime>;

  beforeEach(() => {
    element = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rt = createActionRuntime();
    vi.useFakeTimers();
  });
  afterEach(() => {
    teardownActions(rt);
    vi.useRealTimers();
  });

  it('no-op when element is null', () => {
    expect(() => applyActions(5, [{ type: 'hide', range: { min: 0, max: 10 } }], null, rt)).not.toThrow();
  });

  it('no-op when actions array is empty', () => {
    applyActions(5, [], element, rt);
    expect((element as unknown as HTMLElement).style.display).toBe('');
  });

  it('hide action in-range hides element', () => {
    applyActions(5, [{ type: 'hide', range: { min: 0, max: 10 } }], element, rt);
    expect((element as unknown as HTMLElement).style.display).toBe('none');
  });

  it('hide action out-of-range does NOT hide element', () => {
    applyActions(50, [{ type: 'hide', range: { min: 0, max: 10 } }], element, rt);
    expect((element as unknown as HTMLElement).style.display).toBe('');
  });

  it('blink toggles visibility on interval', () => {
    applyActions(5, [{ type: 'blink', range: { min: 0, max: 10 }, options: { period: 200 } }], element, rt);
    expect(rt.intervalIds.size).toBe(1);
    vi.advanceTimersByTime(200);
    expect((element as unknown as HTMLElement).style.visibility).toBe('hidden');
    vi.advanceTimersByTime(200);
    expect((element as unknown as HTMLElement).style.visibility).toBe('');
  });

  it('teardownActions clears all blink intervals', () => {
    applyActions(5, [{ type: 'blink', range: { min: 0, max: 10 } }], element, rt);
    expect(rt.intervalIds.size).toBe(1);
    teardownActions(rt);
    expect(rt.intervalIds.size).toBe(0);
  });

  it('re-applying actions on same tick clears prior blink', () => {
    applyActions(5, [{ type: 'blink', range: { min: 0, max: 10 } }], element, rt);
    expect(rt.intervalIds.size).toBe(1);
    applyActions(50, [{ type: 'blink', range: { min: 0, max: 10 } }], element, rt);
    expect(rt.intervalIds.size).toBe(0);
  });
});
