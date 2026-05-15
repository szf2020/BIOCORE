import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compileTransform, _resetCompileCache } from '../transform';

describe('compileTransform', () => {
  beforeEach(() => {
    _resetCompileCache();
  });

  it('1. arithmetic expression', () => {
    const fn = compileTransform('v + 1');
    expect(fn(5)).toBe(6);
  });

  it('2. ternary returns string color', () => {
    const fn = compileTransform('v > 100 ? "red" : "green"');
    expect(fn(50)).toBe('green');
    expect(fn(150)).toBe('red');
  });

  it('3. cache hit returns same function reference', () => {
    const first = compileTransform('v * 2');
    const second = compileTransform('v * 2');
    expect(first).toBe(second);
  });

  it('4. invalid syntax falls back to identity + warns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fn = compileTransform('invalid syntax {');
    expect(fn(42)).toBe(42);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});
