// SP-FX-3a pure geometry helpers for the editor canvas. No DOM dependency.

export interface Box { x: number; y: number; w: number; h: number; }
export interface Point { x: number; y: number; }

export type HandleId =
  | 'nw' | 'n' | 'ne'
  | 'w'  | 'e'
  | 'sw' | 's' | 'se'
  | 'rotate';

const ROTATE_HANDLE_OFFSET = 20;
const MIN_BOX = 5;

export function clientToSvg(pt: Point, ctm: { a: number; b: number; c: number; d: number; e: number; f: number }): Point {
  return {
    x: ctm.a * pt.x + ctm.c * pt.y + ctm.e,
    y: ctm.b * pt.x + ctm.d * pt.y + ctm.f,
  };
}

export function handlePositions(box: Box): Record<HandleId, Point> {
  const x = box.x;
  const y = box.y;
  const w = box.w;
  const h = box.h;
  return {
    nw: { x, y },
    n:  { x: x + w / 2, y },
    ne: { x: x + w, y },
    w:  { x, y: y + h / 2 },
    e:  { x: x + w, y: y + h / 2 },
    sw: { x, y: y + h },
    s:  { x: x + w / 2, y: y + h },
    se: { x: x + w, y: y + h },
    rotate: { x: x + w / 2, y: y - ROTATE_HANDLE_OFFSET },
  };
}

const HANDLE_ORDER: HandleId[] = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se', 'rotate'];
const DEFAULT_THRESHOLD = 6;

export function handleFromPoint(box: Box, pt: Point, threshold: number = DEFAULT_THRESHOLD): HandleId | null {
  const positions = handlePositions(box);
  for (const h of HANDLE_ORDER) {
    const p = positions[h];
    if (Math.abs(pt.x - p.x) <= threshold && Math.abs(pt.y - p.y) <= threshold) {
      return h;
    }
  }
  return null;
}

export function applyHandleDrag(box: Box, handle: HandleId, dx: number, dy: number): Box {
  let { x, y, w, h } = box;

  switch (handle) {
    case 'nw': x += dx; y += dy; w -= dx; h -= dy; break;
    case 'n':  y += dy; h -= dy; break;
    case 'ne': y += dy; w += dx; h -= dy; break;
    case 'w':  x += dx; w -= dx; break;
    case 'e':  w += dx; break;
    case 'sw': x += dx; w -= dx; h += dy; break;
    case 's':  h += dy; break;
    case 'se': w += dx; h += dy; break;
    case 'rotate': return box;
  }

  // Clamp. If w/h drops below MIN_BOX, pin and freeze x/y on the side that
  // wouldn't pull beyond the opposite edge.
  if (w < MIN_BOX) {
    w = MIN_BOX;
    if (handle === 'nw' || handle === 'w' || handle === 'sw') x = box.x + (box.w - MIN_BOX);
    else x = box.x;
  }
  if (h < MIN_BOX) {
    h = MIN_BOX;
    if (handle === 'nw' || handle === 'n' || handle === 'ne') y = box.y + (box.h - MIN_BOX);
    else y = box.y;
  }

  return { x, y, w, h };
}

// SP-FX-3b.1: snap helpers — round geometry to gridSize integers.
// MIN-gridSize clamp on w/h ensures snap never produces a 0-width/height widget.

export function snap(box: Box, gridSize: number): Box {
  if (gridSize <= 0) throw new Error('invalid grid size');
  return {
    x: Math.round(box.x / gridSize) * gridSize,
    y: Math.round(box.y / gridSize) * gridSize,
    w: Math.max(gridSize, Math.round(box.w / gridSize) * gridSize),
    h: Math.max(gridSize, Math.round(box.h / gridSize) * gridSize),
  };
}

export function snapPoint(pt: Point, gridSize: number): Point {
  if (gridSize <= 0) throw new Error('invalid grid size');
  return {
    x: Math.round(pt.x / gridSize) * gridSize,
    y: Math.round(pt.y / gridSize) * gridSize,
  };
}

// SP-FX-3b.2.1: multi-widget helpers — AABB computations + multi-drag translation.

export function computeBbox(boxes: Box[]): Box {
  if (boxes.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of boxes) {
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.w > maxX) maxX = b.x + b.w;
    if (b.y + b.h > maxY) maxY = b.y + b.h;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function intersectsBox(a: Box, b: Box): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

export function applyMultiDrag(boxes: Box[], dx: number, dy: number): Box[] {
  return boxes.map((b) => ({ x: b.x + dx, y: b.y + dy, w: b.w, h: b.h }));
}
