import { describe, it, expect } from 'vitest';
import { PALETTE_ITEMS, makeWidget } from '../palette-items';

describe('palette-items PALETTE_ITEMS', () => {
  it('has 3 items (rect, ellipse, text) with required fields', () => {
    expect(PALETTE_ITEMS.length).toBe(3);
    const ids = PALETTE_ITEMS.map((i) => i.id);
    expect(ids).toEqual(['rect', 'ellipse', 'text']);
    for (const item of PALETTE_ITEMS) {
      expect(typeof item.label).toBe('string');
      expect(typeof item.defaultW).toBe('number');
      expect(typeof item.defaultH).toBe('number');
    }
  });
});

describe('palette-items makeWidget', () => {
  it('rect: defaults w=100 h=60, snaps x/y to gridSize=10', () => {
    const w = makeWidget('rect', { x: 23, y: 47 }, 10);
    expect(w.type).toBe('rect');
    expect(w.x).toBe(20);
    expect(w.y).toBe(50);
    expect(w.w).toBe(100);
    expect(w.h).toBe(60);
  });

  it('ellipse: defaults w=80 h=80', () => {
    const w = makeWidget('ellipse', { x: 0, y: 0 }, 10);
    expect(w.w).toBe(80);
    expect(w.h).toBe(80);
  });

  it('text: defaults w=120 h=30', () => {
    const w = makeWidget('text', { x: 0, y: 0 }, 10);
    expect(w.w).toBe(120);
    expect(w.h).toBe(30);
  });

  it('gridSize=0 falls back to step=1 (no snap)', () => {
    const w = makeWidget('rect', { x: 23.7, y: 47.2 }, 0);
    expect(w.x).toBe(24);
    expect(w.y).toBe(47);
  });

  it('id is unique-ish: format w_<digits>_<6-char alnum>', () => {
    const w1 = makeWidget('rect', { x: 0, y: 0 }, 10);
    const w2 = makeWidget('rect', { x: 0, y: 0 }, 10);
    expect(w1.id).toMatch(/^w_\d+_[a-z0-9]{6}$/);
    expect(w2.id).toMatch(/^w_\d+_[a-z0-9]{6}$/);
    expect(w1.id).not.toBe(w2.id);
  });

  it('property is empty object placeholder', () => {
    const w = makeWidget('rect', { x: 0, y: 0 }, 10);
    expect(w.property).toEqual({});
  });
});
