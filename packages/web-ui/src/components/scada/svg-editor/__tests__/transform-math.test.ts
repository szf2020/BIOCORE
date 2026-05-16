import { describe, it, expect } from 'vitest';
import {
  resizeRect,
  rotateAroundCenter,
  snapToGrid,
  intersects,
} from '../transform-math';
import type { AABB } from '../types';

const bbox100: AABB = { x: 10, y: 20, w: 100, h: 80 };

describe('resizeRect', () => {
  it('se handle: nw corner stays fixed, w/h grow by dx/dy', () => {
    const r = resizeRect(bbox100, 'se', 30, 20, { aspect: false, centered: false });
    expect(r).toEqual({ x: 10, y: 20, w: 130, h: 100 });
  });

  it('nw handle: se corner stays fixed, x/y shift, w/h shrink by dx/dy', () => {
    const r = resizeRect(bbox100, 'nw', 10, 5, { aspect: false, centered: false });
    expect(r).toEqual({ x: 20, y: 25, w: 90, h: 75 });
  });

  it('n edge: x and width fixed, y shifts, h shrinks', () => {
    const r = resizeRect(bbox100, 'n', 0, 10, { aspect: false, centered: false });
    expect(r).toEqual({ x: 10, y: 30, w: 100, h: 70 });
  });

  it('e edge: only width grows', () => {
    const r = resizeRect(bbox100, 'e', 25, 999, { aspect: false, centered: false });
    expect(r).toEqual({ x: 10, y: 20, w: 125, h: 80 });
  });

  it('aspect lock: locks w/h ratio (dx dominant)', () => {
    const r = resizeRect(bbox100, 'se', 40, 10, { aspect: true, centered: false });
    expect(r.w).toBe(140);
    expect(r.h).toBeCloseTo(112);
  });

  it('centered: keeps center fixed (se handle)', () => {
    const r = resizeRect(bbox100, 'se', 20, 20, { aspect: false, centered: true });
    expect(r).toEqual({ x: -10, y: 0, w: 140, h: 120 });
  });

  it('clamps to minimum 1x1', () => {
    const r = resizeRect(bbox100, 'se', -200, -200, { aspect: false, centered: false });
    expect(r.w).toBeGreaterThanOrEqual(1);
    expect(r.h).toBeGreaterThanOrEqual(1);
  });

  it('handles drag-through flip (negative width)', () => {
    const r = resizeRect(bbox100, 'se', -150, -100, { aspect: false, centered: false });
    expect(r.x).toBeLessThan(10);
    expect(r.w).toBeGreaterThan(0);
    expect(r.h).toBeGreaterThan(0);
  });
});

describe('rotateAroundCenter', () => {
  it('returns currentRotation + delta from atan2 difference', () => {
    const r = rotateAroundCenter(
      { x: 10, y: 10, w: 100, h: 100 },
      0,
      { x: 60, y: 0 },
      { x: 120, y: 60 },
      { snap15: false },
    );
    expect(r).toBeCloseTo(90, 1);
  });

  it('snap15: rounds to nearest 15°', () => {
    const r = rotateAroundCenter(
      { x: 0, y: 0, w: 100, h: 100 },
      0,
      { x: 50, y: 0 },
      { x: 87, y: -7 },
      { snap15: true },
    );
    expect(r % 15).toBe(0);
  });
});

describe('snapToGrid', () => {
  it('snaps to nearest multiple of gridSize', () => {
    expect(snapToGrid(13, 10)).toBe(10);
    expect(snapToGrid(16, 10)).toBe(20);
    expect(snapToGrid(20, 10)).toBe(20);
  });
});

describe('intersects', () => {
  it('returns true for overlapping AABBs and false otherwise', () => {
    const a: AABB = { x: 0, y: 0, w: 50, h: 50 };
    const b: AABB = { x: 25, y: 25, w: 50, h: 50 };
    const c: AABB = { x: 100, y: 100, w: 10, h: 10 };
    expect(intersects(a, b)).toBe(true);
    expect(intersects(a, c)).toBe(false);
  });
});
