import { describe, it, expect } from 'vitest';
import {
  PALETTE_ITEMS,
  DRAW_TOOL_ITEMS,
  makeWidget,
  makeDrawnWidget,
  makeEllipseFromDrag,
  makeShapeWidget,
} from '../palette-items';

describe('palette-items PALETTE_ITEMS', () => {
  it('has 4 items (rect, ellipse, text, line) with required fields', () => {
    expect(PALETTE_ITEMS.length).toBe(4);
    const ids = PALETTE_ITEMS.map((i) => i.id);
    expect(ids).toEqual(['rect', 'ellipse', 'text', 'line']);
    for (const item of PALETTE_ITEMS) {
      expect(typeof item.label).toBe('string');
      expect(typeof item.defaultW).toBe('number');
      expect(typeof item.defaultH).toBe('number');
    }
  });

  it('line: defaults w=120 h=2', () => {
    const w = makeWidget('line', { x: 0, y: 0 }, 10);
    expect(w.type).toBe('line');
    expect(w.w).toBe(120);
    expect(w.h).toBe(2);
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

describe('palette-items DRAW_TOOL_ITEMS (SP-FX-48.17)', () => {
  it('exports 3 draw tools (pencil/ellipse-draw/path) with labels', () => {
    expect(DRAW_TOOL_ITEMS.length).toBe(3);
    const ids = DRAW_TOOL_ITEMS.map((t) => t.id);
    expect(ids).toEqual(['pencil', 'ellipse-draw', 'path']);
    for (const t of DRAW_TOOL_ITEMS) {
      expect(typeof t.label).toBe('string');
      expect(t.label.length).toBeGreaterThan(0);
    }
  });
});

describe('palette-items makeDrawnWidget (SP-FX-48.17)', () => {
  it('returns null when fewer than 2 points', () => {
    expect(makeDrawnWidget('pencil', [])).toBeNull();
    expect(makeDrawnWidget('pencil', [10, 10])).toBeNull();
    expect(makeDrawnWidget('path', [10])).toBeNull();
  });

  it('computes bbox from points and stores them in property.points', () => {
    const w = makeDrawnWidget('pencil', [10, 20, 50, 60, 30, 100]);
    expect(w).not.toBeNull();
    expect(w!.type).toBe('pencil');
    expect(w!.x).toBe(10);
    expect(w!.y).toBe(20);
    expect(w!.w).toBe(40);
    expect(w!.h).toBe(80);
    expect((w!.property as { points: number[] }).points).toEqual([10, 20, 50, 60, 30, 100]);
  });

  it('path type preserves provided points', () => {
    const w = makeDrawnWidget('path', [0, 0, 100, 100]);
    expect(w!.type).toBe('path');
    expect((w!.property as { points: number[] }).points).toEqual([0, 0, 100, 100]);
  });

  it('clamps minimum w/h to 2 when bbox is zero-width or zero-height', () => {
    const w = makeDrawnWidget('pencil', [50, 0, 50, 100]);
    expect(w!.w).toBe(2);
    expect(w!.h).toBe(100);
  });
});

describe('palette-items makeShapeWidget (SP-FX-48.20)', () => {
  it('creates shape widget with shapeName + scaled 2x bbox + snapped x/y', () => {
    const w = makeShapeWidget('centrifugal', { w: 40, h: 40 }, { x: 23, y: 47 }, 10);
    expect(w.type).toBe('shape');
    expect((w.property as { shapeName: string }).shapeName).toBe('centrifugal');
    expect(w.x).toBe(20); // snapped
    expect(w.y).toBe(50); // snapped
    expect(w.w).toBe(80); // 40 * 2 scaled, snapped
    expect(w.h).toBe(80);
  });

  it('default property includes fill=none + stroke + strokeWidth', () => {
    const w = makeShapeWidget('valve-ax', { w: 60, h: 60 }, { x: 0, y: 0 }, 10);
    const p = w.property as { fill: string; stroke: string; strokeWidth: number };
    expect(p.fill).toBe('none');
    expect(p.stroke).toBe('#1e293b');
    expect(p.strokeWidth).toBe(1.5);
  });

  it('clamps minimum w/h to 20 when bbox is tiny', () => {
    const w = makeShapeWidget('mini', { w: 4, h: 4 }, { x: 0, y: 0 }, 10);
    expect(w.w).toBeGreaterThanOrEqual(20);
    expect(w.h).toBeGreaterThanOrEqual(20);
  });
});

describe('palette-items makeEllipseFromDrag (SP-FX-48.17)', () => {
  it('returns null when drag is below minimum size (< 4px in either dim)', () => {
    expect(makeEllipseFromDrag({ x: 0, y: 0 }, { x: 2, y: 100 }, 10)).toBeNull();
    expect(makeEllipseFromDrag({ x: 0, y: 0 }, { x: 100, y: 2 }, 10)).toBeNull();
  });

  it('builds ellipse widget from drag bbox, snapping to gridSize', () => {
    const w = makeEllipseFromDrag({ x: 13, y: 27 }, { x: 100, y: 80 }, 10);
    expect(w).not.toBeNull();
    expect(w!.type).toBe('ellipse');
    expect(w!.x).toBe(10);
    expect(w!.y).toBe(30);
    expect(w!.w).toBe(90);
    expect(w!.h).toBe(50);
  });

  it('handles inverted drag direction (p2 before p1)', () => {
    const w = makeEllipseFromDrag({ x: 100, y: 100 }, { x: 20, y: 20 }, 10);
    expect(w).not.toBeNull();
    expect(w!.x).toBe(20);
    expect(w!.y).toBe(20);
    expect(w!.w).toBe(80);
    expect(w!.h).toBe(80);
  });
});

