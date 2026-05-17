import { describe, it, expect } from 'vitest';
import { boxIntersects, diffSelection, type Rect } from '../selection';

describe('selection.boxIntersects (SP-FX-2)', () => {
  const box: Rect = { x: 0, y: 0, w: 100, h: 100 };

  it('returns true when widget fully inside box', () => {
    expect(boxIntersects(box, { x: 10, y: 10, w: 20, h: 20 })).toBe(true);
  });

  it('returns true when widget partially intersects', () => {
    expect(boxIntersects(box, { x: 90, y: 90, w: 50, h: 50 })).toBe(true);
  });

  it('returns false when widget fully right of box', () => {
    expect(boxIntersects(box, { x: 200, y: 0, w: 10, h: 10 })).toBe(false);
  });

  it('returns false when widget fully below box', () => {
    expect(boxIntersects(box, { x: 0, y: 200, w: 10, h: 10 })).toBe(false);
  });

  it('returns true when widget edges exactly meet box edges', () => {
    expect(boxIntersects(box, { x: 100, y: 50, w: 0, h: 0 })).toBe(true);
  });
});

describe('selection.diffSelection (SP-FX-2)', () => {
  it('reports added ids', () => {
    expect(diffSelection(['a'], ['a', 'b'])).toEqual({ added: ['b'], removed: [] });
  });

  it('reports removed ids', () => {
    expect(diffSelection(['a', 'b'], ['b'])).toEqual({ added: [], removed: ['a'] });
  });

  it('reports both added and removed', () => {
    expect(diffSelection(['a', 'b'], ['b', 'c'])).toEqual({ added: ['c'], removed: ['a'] });
  });
});
