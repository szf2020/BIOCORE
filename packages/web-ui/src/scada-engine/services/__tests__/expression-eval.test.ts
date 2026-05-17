import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evalExpression, parseTagsFromExpression, __clearParseCache } from '../expression-eval';

describe('expression-eval (SP-FX-2)', () => {
  beforeEach(() => { __clearParseCache(); });

  it('evaluates simple arithmetic', () => {
    expect(evalExpression('1 + 2 * 3', {})).toBe(7);
  });

  it('evaluates with tag variables', () => {
    expect(evalExpression('temp + 10', { temp: 25 })).toBe(35);
  });

  it('evaluates comparison and logical', () => {
    expect(evalExpression('(t > 30) and (t < 80)', { t: 50 })).toBe(true);
    expect(evalExpression('a == b', { a: 1, b: 1 })).toBe(true);
  });

  it('evaluates IF function', () => {
    expect(evalExpression('IF(t < 80, 1, 0)', { t: 50 })).toBe(1);
    expect(evalExpression('IF(t < 80, 1, 0)', { t: 90 })).toBe(0);
  });

  it('evaluates MIN/MAX/ABS/ROUND', () => {
    expect(evalExpression('MIN(a, b)', { a: 5, b: 3 })).toBe(3);
    expect(evalExpression('MAX(a, b)', { a: 5, b: 3 })).toBe(5);
    expect(evalExpression('ABS(x)', { x: -7 })).toBe(7);
    expect(evalExpression('ROUND(3.7)', {})).toBe(4);
    expect(evalExpression('ROUND(3.14159, 2)', {})).toBe(3.14);
  });

  it('returns undefined for invalid syntax', () => {
    expect(evalExpression('a +', {})).toBeUndefined();
    expect(evalExpression('(a + b', {})).toBeUndefined();
    expect(evalExpression('@invalid', {})).toBeUndefined();
  });

  it('returns undefined for empty / whitespace', () => {
    expect(evalExpression('', {})).toBeUndefined();
    expect(evalExpression('   ', {})).toBeUndefined();
  });

  it('treats missing tag values as 0', () => {
    expect(evalExpression('a + 1', {})).toBe(1);
  });

  it('rejects expressions longer than 500 chars', () => {
    const huge = 'a +'.repeat(170);
    expect(huge.length).toBeGreaterThan(500);
    expect(evalExpression(huge, { a: 1 })).toBeUndefined();
  });

  it('does NOT allow member access (obj.prop)', () => {
    expect(evalExpression('obj.prop', { obj: { prop: 99 } as any })).toBeUndefined();
  });

  it('parseTagsFromExpression returns only tag identifiers, excludes safe fns', () => {
    expect(parseTagsFromExpression('IF(temp < 80, MIN(a, b), 0)').sort())
      .toEqual(['a', 'b', 'temp']);
  });

  it('parseTagsFromExpression returns [] for invalid / empty', () => {
    expect(parseTagsFromExpression('a +')).toEqual([]);
    expect(parseTagsFromExpression('')).toEqual([]);
  });

  it('parseCache makes repeat calls return the same result with different vars', () => {
    expect(evalExpression('a + b', { a: 1, b: 2 })).toBe(3);
    expect(evalExpression('a + b', { a: 10, b: 20 })).toBe(30);
    expect(evalExpression('a + b', { a: 0, b: 0 })).toBe(0);
  });

  it('emits at least one console.warn for an invalid expression', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    evalExpression('a +', {});
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
