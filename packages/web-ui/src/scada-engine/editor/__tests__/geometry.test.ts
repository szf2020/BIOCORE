import { describe, it, expect } from 'vitest';
import {
  clientToSvg, handlePositions, handleFromPoint, applyHandleDrag,
  snap, snapPoint,
  computeBbox, intersectsBox, applyMultiDrag,
  applyRotate,
  applyMultiRotate, applyGroupResize, anchorOf,
  type Box, type Point,
} from '../geometry';
import { identityMatrix } from '@/test/svgDomHelpers';

describe('geometry.clientToSvg (SP-FX-3a)', () => {
  it('identity ctm returns same point', () => {
    expect(clientToSvg({ x: 10, y: 20 }, identityMatrix())).toEqual({ x: 10, y: 20 });
  });

  it('translate matrix shifts point by e/f', () => {
    const m = identityMatrix();
    (m as any).e = 100; (m as any).f = 50;
    const out = clientToSvg({ x: 10, y: 20 }, m);
    expect(out.x).toBe(110);
    expect(out.y).toBe(70);
  });

  it('scale matrix scales point by a/d', () => {
    const m = identityMatrix();
    (m as any).a = 2; (m as any).d = 2;
    expect(clientToSvg({ x: 10, y: 20 }, m)).toEqual({ x: 20, y: 40 });
  });
});

describe('geometry.handlePositions (SP-FX-3a)', () => {
  it('returns 9 handle positions for a 100x80 box at origin', () => {
    const box: Box = { x: 0, y: 0, w: 100, h: 80 };
    const p = handlePositions(box);
    expect(p.nw).toEqual({ x: 0, y: 0 });
    expect(p.n).toEqual({ x: 50, y: 0 });
    expect(p.ne).toEqual({ x: 100, y: 0 });
    expect(p.w).toEqual({ x: 0, y: 40 });
    expect(p.e).toEqual({ x: 100, y: 40 });
    expect(p.sw).toEqual({ x: 0, y: 80 });
    expect(p.s).toEqual({ x: 50, y: 80 });
    expect(p.se).toEqual({ x: 100, y: 80 });
    // SP-FX-48.27: rotate handle floats above bbox top center (FUXA fidelity)
    expect(p.rotate.x).toBe(50);
    expect(p.rotate.y).toBe(-20);
  });

  it('handles offset box', () => {
    const box: Box = { x: 50, y: 30, w: 200, h: 100 };
    const p = handlePositions(box);
    expect(p.se).toEqual({ x: 250, y: 130 });
    expect(p.n).toEqual({ x: 150, y: 30 });
  });

  it('handles 5x5 minimum box', () => {
    const box: Box = { x: 0, y: 0, w: 5, h: 5 };
    const p = handlePositions(box);
    expect(p.se).toEqual({ x: 5, y: 5 });
  });
});

describe('geometry.handleFromPoint (SP-FX-3a)', () => {
  const box: Box = { x: 100, y: 100, w: 80, h: 60 };

  it('detects SE handle within threshold', () => {
    expect(handleFromPoint(box, { x: 180, y: 160 })).toBe('se');
    expect(handleFromPoint(box, { x: 183, y: 162 })).toBe('se');
  });

  it('detects each corner handle', () => {
    expect(handleFromPoint(box, { x: 100, y: 100 })).toBe('nw');
    expect(handleFromPoint(box, { x: 180, y: 100 })).toBe('ne');
    expect(handleFromPoint(box, { x: 100, y: 160 })).toBe('sw');
  });

  it('detects each edge midpoint handle', () => {
    expect(handleFromPoint(box, { x: 140, y: 100 })).toBe('n');
    expect(handleFromPoint(box, { x: 180, y: 130 })).toBe('e');
    expect(handleFromPoint(box, { x: 140, y: 160 })).toBe('s');
    expect(handleFromPoint(box, { x: 100, y: 130 })).toBe('w');
  });

  it('returns null for point well inside body (no handle near)', () => {
    // SP-FX-48.27: rotate handle floats above bbox top center; widget body is clear.
    expect(handleFromPoint(box, { x: 140, y: 130 })).toBeNull();
  });

  it('detects rotate handle above bbox top center (SP-FX-48.27)', () => {
    // box top center = (140, 100); rotate offset = 20 → (140, 80)
    expect(handleFromPoint(box, { x: 140, y: 80 })).toBe('rotate');
  });

  it('returns null for points far outside', () => {
    expect(handleFromPoint(box, { x: 50, y: 50 })).toBeNull();
    expect(handleFromPoint(box, { x: 300, y: 300 })).toBeNull();
  });

  it('respects custom threshold', () => {
    expect(handleFromPoint(box, { x: 190, y: 170 }, 3)).toBeNull();
    expect(handleFromPoint(box, { x: 190, y: 170 }, 15)).toBe('se');
  });
});

describe('geometry.applyHandleDrag (SP-FX-3a)', () => {
  const box: Box = { x: 100, y: 100, w: 80, h: 60 };

  it('SE handle: dx/dy increases w/h', () => {
    expect(applyHandleDrag(box, 'se', 20, 10)).toEqual({ x: 100, y: 100, w: 100, h: 70 });
  });

  it('NW handle: dx/dy moves x/y and shrinks w/h', () => {
    expect(applyHandleDrag(box, 'nw', 10, 10)).toEqual({ x: 110, y: 110, w: 70, h: 50 });
  });

  it('N handle: dy moves y and shrinks h', () => {
    expect(applyHandleDrag(box, 'n', 0, 15)).toEqual({ x: 100, y: 115, w: 80, h: 45 });
  });

  it('E handle: dx grows w', () => {
    expect(applyHandleDrag(box, 'e', 30, 0)).toEqual({ x: 100, y: 100, w: 110, h: 60 });
  });

  it('clamps SE shrink to 5x5 minimum', () => {
    expect(applyHandleDrag(box, 'se', -200, -200)).toEqual({ x: 100, y: 100, w: 5, h: 5 });
  });

  it('clamps NW over-expand to 5x5 minimum', () => {
    const out = applyHandleDrag(box, 'nw', 200, 200);
    expect(out.w).toBe(5);
    expect(out.h).toBe(5);
  });

  it('rotate handle is a no-op in SP-FX-3a', () => {
    expect(applyHandleDrag(box, 'rotate', 50, 50)).toEqual(box);
  });
});

describe('geometry.snap (SP-FX-3b.1)', () => {
  it('rounds box.x/y down to grid', () => {
    expect(snap({ x: 3, y: 7, w: 100, h: 100 }, 10)).toEqual({ x: 0, y: 10, w: 100, h: 100 });
  });

  it('rounds box.x/y up to grid', () => {
    expect(snap({ x: 6, y: 7, w: 100, h: 100 }, 10)).toEqual({ x: 10, y: 10, w: 100, h: 100 });
  });

  it('rounds w/h to grid', () => {
    expect(snap({ x: 0, y: 0, w: 103, h: 97 }, 10)).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });

  it('clamps w/h to gridSize when snap would zero; snapPoint also rounds', () => {
    expect(snap({ x: 0, y: 0, w: 3, h: 3 }, 10)).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    expect(snapPoint({ x: 23, y: 47 }, 10)).toEqual({ x: 20, y: 50 });
  });
});

describe('geometry.computeBbox (SP-FX-3b.2.1)', () => {
  it('empty array returns zero box', () => {
    expect(computeBbox([])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  it('single box returns same box', () => {
    const b: Box = { x: 10, y: 20, w: 50, h: 30 };
    expect(computeBbox([b])).toEqual(b);
  });

  it('two disjoint boxes returns union AABB', () => {
    const a: Box = { x: 10, y: 10, w: 50, h: 30 };
    const b: Box = { x: 100, y: 100, w: 60, h: 40 };
    expect(computeBbox([a, b])).toEqual({ x: 10, y: 10, w: 150, h: 130 });
  });
});

describe('geometry.intersectsBox (SP-FX-3b.2.1)', () => {
  it('disjoint boxes return false', () => {
    expect(intersectsBox({ x: 0, y: 0, w: 10, h: 10 }, { x: 100, y: 100, w: 10, h: 10 })).toBe(false);
  });

  it('overlapping and edge-touch boxes return true', () => {
    expect(intersectsBox({ x: 0, y: 0, w: 50, h: 50 }, { x: 30, y: 30, w: 50, h: 50 })).toBe(true);
    expect(intersectsBox({ x: 0, y: 0, w: 50, h: 50 }, { x: 50, y: 0, w: 50, h: 50 })).toBe(true);
  });
});

describe('geometry.applyMultiDrag (SP-FX-3b.2.1)', () => {
  it('translates all boxes by delta, preserves w/h, returns [] for empty input', () => {
    expect(applyMultiDrag([], 10, 20)).toEqual([]);
    const boxes: Box[] = [{ x: 0, y: 0, w: 50, h: 30 }, { x: 100, y: 100, w: 60, h: 40 }];
    expect(applyMultiDrag(boxes, 10, 20)).toEqual([
      { x: 10, y: 20, w: 50, h: 30 },
      { x: 110, y: 120, w: 60, h: 40 },
    ]);
  });
});

describe('geometry.applyRotate (SP-FX-3b.2.2)', () => {
  const pivot: Point = { x: 100, y: 100 };

  it('mouse stays at startPt: returns startRotate (no delta)', () => {
    const startPt: Point = { x: 150, y: 100 };
    expect(applyRotate(pivot, startPt, startPt, 30, 0)).toBe(30);
  });

  it('90 degree rotation: mouse from +x to +y axis returns +90', () => {
    const startPt: Point = { x: 150, y: 100 }; // angle 0
    const currentPt: Point = { x: 100, y: 150 }; // angle 90 (svg y down → +y axis)
    expect(applyRotate(pivot, startPt, currentPt, 0, 0)).toBe(90);
  });

  it('snap step 15: raw 23 → 30 (round to nearest)', () => {
    const startPt: Point = { x: 150, y: 100 };
    const currentPt: Point = {
      x: 100 + 50 * Math.cos(23 * Math.PI / 180),
      y: 100 + 50 * Math.sin(23 * Math.PI / 180),
    };
    expect(applyRotate(pivot, startPt, currentPt, 0, 15)).toBe(30);
  });

  it('snap step 15: raw 7 → 0 (round to nearest)', () => {
    const startPt: Point = { x: 150, y: 100 };
    const currentPt: Point = {
      x: 100 + 50 * Math.cos(7 * Math.PI / 180),
      y: 100 + 50 * Math.sin(7 * Math.PI / 180),
    };
    expect(applyRotate(pivot, startPt, currentPt, 0, 15)).toBe(0);
  });

  it('normalize: startRotate 350 + delta 30 → 20 (mod 360)', () => {
    const startPt: Point = { x: 150, y: 100 };
    const currentPt: Point = {
      x: 100 + 50 * Math.cos(30 * Math.PI / 180),
      y: 100 + 50 * Math.sin(30 * Math.PI / 180),
    };
    expect(applyRotate(pivot, startPt, currentPt, 350, 0)).toBe(20);
  });
});

describe('geometry.applyMultiRotate (SP-FX-3b.2.3)', () => {
  it('empty Map returns empty Map', () => {
    const result = applyMultiRotate(new Map(), new Map(), { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0 }, 0);
    expect(result.size).toBe(0);
  });

  it('single widget at bbox center, 90° delta: position unchanged (orbit radius 0), rotate += 90', () => {
    const startBoxes = new Map<string, Box>([['w1', { x: -25, y: -15, w: 50, h: 30 }]]);
    const startRotates = new Map<string, number>([['w1', 0]]);
    const pivot: Point = { x: 0, y: 0 };
    const startPt: Point = { x: 50, y: 0 };
    const currentPt: Point = { x: 0, y: 50 };
    const result = applyMultiRotate(startBoxes, startRotates, pivot, startPt, currentPt, 0);
    const w1 = result.get('w1')!;
    expect(w1.box.x).toBeCloseTo(-25, 5);
    expect(w1.box.y).toBeCloseTo(-15, 5);
    expect(w1.rotate).toBeCloseTo(90, 5);
  });

  it('2 widgets offset from bbox center, 90° delta: centers rotated, rotate accumulates', () => {
    const startBoxes = new Map<string, Box>([
      ['w1', { x: 100, y: -10, w: 20, h: 20 }],
      ['w2', { x: -10, y: 100, w: 20, h: 20 }],
    ]);
    const startRotates = new Map<string, number>([['w1', 0], ['w2', 30]]);
    const pivot: Point = { x: 0, y: 0 };
    const startPt: Point = { x: 50, y: 0 };
    const currentPt: Point = { x: 0, y: 50 };
    const result = applyMultiRotate(startBoxes, startRotates, pivot, startPt, currentPt, 0);
    expect(result.get('w1')!.box.x).toBeCloseTo(-10, 5);
    expect(result.get('w1')!.box.y).toBeCloseTo(100, 5);
    expect(result.get('w1')!.rotate).toBeCloseTo(90, 5);
    expect(result.get('w2')!.box.x).toBeCloseTo(-120, 5);
    expect(result.get('w2')!.box.y).toBeCloseTo(-10, 5);
    expect(result.get('w2')!.rotate).toBeCloseTo(120, 5);
  });

  it('snapStep 15: raw 23° delta snaps to 30°', () => {
    const startBoxes = new Map<string, Box>([['w1', { x: -25, y: -15, w: 50, h: 30 }]]);
    const startRotates = new Map<string, number>([['w1', 0]]);
    const pivot: Point = { x: 0, y: 0 };
    const startPt: Point = { x: 50, y: 0 };
    const currentPt: Point = {
      x: 50 * Math.cos(23 * Math.PI / 180),
      y: 50 * Math.sin(23 * Math.PI / 180),
    };
    const result = applyMultiRotate(startBoxes, startRotates, pivot, startPt, currentPt, 15);
    expect(result.get('w1')!.rotate).toBe(30);
  });
});

describe('geometry.applyGroupResize (SP-FX-3b.2.3)', () => {
  it('SE corner 2x scale: all widgets scale 2x from NW anchor', () => {
    const startBbox: Box = { x: 0, y: 0, w: 100, h: 80 };
    const newBbox: Box = { x: 0, y: 0, w: 200, h: 160 };
    const startBoxes = new Map<string, Box>([
      ['w1', { x: 10, y: 10, w: 30, h: 20 }],
      ['w2', { x: 60, y: 50, w: 30, h: 20 }],
    ]);
    const result = applyGroupResize(startBbox, newBbox, 'se', startBoxes, false);
    expect(result).not.toBeNull();
    if (!result) return;
    const w1 = result.widgets.get('w1')!;
    expect(w1.x).toBe(20);
    expect(w1.y).toBe(20);
    expect(w1.w).toBe(60);
    expect(w1.h).toBe(40);
    const w2 = result.widgets.get('w2')!;
    expect(w2.x).toBe(120);
    expect(w2.y).toBe(100);
    expect(w2.w).toBe(60);
    expect(w2.h).toBe(40);
  });

  it('aspectLock on NW corner picks min absolute scale', () => {
    const startBbox: Box = { x: 0, y: 0, w: 100, h: 100 };
    const newBbox: Box = { x: -100, y: -50, w: 200, h: 150 };
    const startBoxes = new Map<string, Box>([['w1', { x: 0, y: 0, w: 100, h: 100 }]]);
    const result = applyGroupResize(startBbox, newBbox, 'nw', startBoxes, true);
    expect(result).not.toBeNull();
    if (!result) return;
    const w1 = result.widgets.get('w1')!;
    expect(w1.w).toBe(150);
    expect(w1.h).toBe(150);
  });

  it('any widget projecting w<5 returns null (freeze)', () => {
    const startBbox: Box = { x: 0, y: 0, w: 100, h: 80 };
    const newBbox: Box = { x: 0, y: 0, w: 2, h: 80 };
    const startBoxes = new Map<string, Box>([['w1', { x: 0, y: 0, w: 100, h: 80 }]]);
    const result = applyGroupResize(startBbox, newBbox, 'e', startBoxes, false);
    expect(result).toBeNull();
  });
});
