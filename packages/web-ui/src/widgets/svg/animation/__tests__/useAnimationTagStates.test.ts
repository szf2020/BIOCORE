import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAnimationTagStates } from '../useAnimationTagStates';
import type { SvgAnimation } from '../types';

vi.mock('@/hooks/useTag', () => ({
  useTag: vi.fn((tagId: string) => {
    if (tagId === 'F01.AI-0') return { value: 42, isStale: false, ageMs: 100 };
    if (tagId === 'F01.AI-1') return { value: 7, isStale: false, ageMs: 100 };
    return { value: null, isStale: true, ageMs: 9999 };
  }),
}));

describe('useAnimationTagStates', () => {
  it('returns empty array for undefined animations', () => {
    const { result } = renderHook(() => useAnimationTagStates(undefined));
    expect(result.current).toEqual([]);
  });

  it('returns one TagSnapshot per animation in order', () => {
    const anims: SvgAnimation[] = [
      { type: 'color', tag: 'F01.AI-0', rule: { kind: 'discreteMap', map: {} } },
      { type: 'rotate', tag: 'F01.AI-1', rule: { kind: 'linearScale', inMin: 0, inMax: 100, outMin: 0, outMax: 360 } },
    ];
    const { result } = renderHook(() => useAnimationTagStates(anims));
    expect(result.current).toHaveLength(2);
    expect(result.current[0].value).toBe(42);
    expect(result.current[1].value).toBe(7);
  });
});
