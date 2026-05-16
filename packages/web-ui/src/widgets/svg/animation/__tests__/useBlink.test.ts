import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBlink } from '../useBlink';
import type { SvgAnimation } from '../types';

describe('useBlink', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true initially regardless of animations', () => {
    const { result } = renderHook(() => useBlink(undefined));
    expect(result.current).toBe(true);
  });

  it('toggles phase at 1 Hz when blink animation present', () => {
    const anims: SvgAnimation[] = [{
      type: 'blink',
      tag: 'F01.AI-0',
      rule: { kind: 'discreteMap', map: { '1': true }, default: false },
    }];
    const { result } = renderHook(() => useBlink(anims));
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current).toBe(true);
  });

  it('does not start interval when no blink animation present', () => {
    const anims: SvgAnimation[] = [{
      type: 'color',
      tag: 'F01.AI-0',
      rule: { kind: 'discreteMap', map: { '1': '#0f0' }, default: '#000' },
    }];
    const { result } = renderHook(() => useBlink(anims));
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current).toBe(true);
  });
});
