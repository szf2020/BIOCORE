import { describe, it, expect } from 'vitest';
import { evaluateAnimationRule } from '../rules';

describe('evaluateAnimationRule', () => {
  describe('discreteMap', () => {
    it('returns mapped value on exact-string hit', () => {
      const r = { kind: 'discreteMap' as const, map: { '1': 'red', '2': 'green' }, default: 'gray' };
      expect(evaluateAnimationRule(r, 1)).toBe('red');
    });

    it('returns default on miss', () => {
      const r = { kind: 'discreteMap' as const, map: { '0': 'red' }, default: 'gray' };
      expect(evaluateAnimationRule(r, 99)).toBe('gray');
    });

    it('returns undefined when no default and miss', () => {
      const r = { kind: 'discreteMap' as const, map: { '0': 'red' } };
      expect(evaluateAnimationRule(r, 99)).toBeUndefined();
    });

    it('coerces null tag value to string "null" for lookup', () => {
      const r = { kind: 'discreteMap' as const, map: { 'null': 'gray', '1': 'green' }, default: 'fallback' };
      expect(evaluateAnimationRule(r, null)).toBe('gray');
    });
  });

  describe('thresholdRanges', () => {
    it('returns matching range value', () => {
      const r = {
        kind: 'thresholdRanges' as const,
        ranges: [
          { min: 0, max: 50, value: '#22c55e' },
          { min: 50, max: 80, value: '#facc15' },
          { min: 80, max: 100, value: '#dc2626' },
        ],
        default: '#000',
      };
      expect(evaluateAnimationRule(r, 75)).toBe('#facc15');
    });

    it('returns default when out of all ranges', () => {
      const r = {
        kind: 'thresholdRanges' as const,
        ranges: [{ min: 0, max: 50, value: 'in' }],
        default: 'out',
      };
      expect(evaluateAnimationRule(r, 100)).toBe('out');
    });

    it('uses first match when ranges overlap', () => {
      const r = {
        kind: 'thresholdRanges' as const,
        ranges: [
          { min: 0, max: 60, value: 'first' },
          { min: 50, max: 100, value: 'second' },
        ],
      };
      expect(evaluateAnimationRule(r, 55)).toBe('first');
    });

    it('includes upper bound of last range (inclusive max)', () => {
      const r = {
        kind: 'thresholdRanges' as const,
        ranges: [
          { min: 0, max: 50, value: 'a' },
          { min: 50, max: 100, value: 'b' },
        ],
      };
      expect(evaluateAnimationRule(r, 100)).toBe('b');
    });

    it('returns default for non-finite tag value', () => {
      const r = {
        kind: 'thresholdRanges' as const,
        ranges: [{ min: 0, max: 100, value: 'x' }],
        default: 'fallback',
      };
      expect(evaluateAnimationRule(r, null)).toBe('fallback');
      expect(evaluateAnimationRule(r, NaN)).toBe('fallback');
    });
  });

  describe('linearScale', () => {
    it('interpolates linearly at midpoint', () => {
      const r = { kind: 'linearScale' as const, inMin: 0, inMax: 100, outMin: 0, outMax: 360 };
      expect(evaluateAnimationRule(r, 50)).toBe(180);
    });

    it('returns outMin when inMin equals inMax (no divide by zero)', () => {
      const r = { kind: 'linearScale' as const, inMin: 50, inMax: 50, outMin: 10, outMax: 20 };
      expect(evaluateAnimationRule(r, 50)).toBe(10);
    });

    it('clamps result when clamp=true', () => {
      const r = { kind: 'linearScale' as const, inMin: 0, inMax: 100, outMin: 0, outMax: 360, clamp: true };
      expect(evaluateAnimationRule(r, 150)).toBe(360);
      expect(evaluateAnimationRule(r, -50)).toBe(0);
    });
  });
});
