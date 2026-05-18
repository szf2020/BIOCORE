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

// SP-FX-3b.2.2: rotation math — atan2-delta around pivot, optional snap to step.

export function applyRotate(
  pivot: Point,
  startPt: Point,
  currentPt: Point,
  startRotate: number,
  snapStep: number,
): number {
  const a0 = Math.atan2(startPt.y - pivot.y, startPt.x - pivot.x);
  const a1 = Math.atan2(currentPt.y - pivot.y, currentPt.x - pivot.x);
  let deg = startRotate + (a1 - a0) * 180 / Math.PI;
  deg = ((deg % 360) + 360) % 360;
  if (snapStep > 0) deg = Math.round(deg / snapStep) * snapStep;
  if (deg === 360) deg = 0;
  return deg;
}

// SP-FX-3b.2.3: multi-select rotate + group-resize helpers.

export type MultiRotateResult = Map<string, { box: Box; rotate: number }>;

export function applyMultiRotate(
  startBoxes: Map<string, Box>,
  startRotates: Map<string, number>,
  pivot: Point,
  startPt: Point,
  currentPt: Point,
  snapStep: number,
): MultiRotateResult {
  const a0 = Math.atan2(startPt.y - pivot.y, startPt.x - pivot.x);
  const a1 = Math.atan2(currentPt.y - pivot.y, currentPt.x - pivot.x);
  let delta = (a1 - a0) * 180 / Math.PI;
  if (snapStep > 0) delta = Math.round(delta / snapStep) * snapStep;
  const rad = delta * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const out: MultiRotateResult = new Map();
  for (const [id, sb] of startBoxes) {
    const sr = startRotates.get(id) ?? 0;
    const wcx = sb.x + sb.w / 2;
    const wcy = sb.y + sb.h / 2;
    const dx = wcx - pivot.x;
    const dy = wcy - pivot.y;
    const newCx = pivot.x + dx * cos - dy * sin;
    const newCy = pivot.y + dx * sin + dy * cos;
    const newBox: Box = { x: newCx - sb.w / 2, y: newCy - sb.h / 2, w: sb.w, h: sb.h };
    let newRotate = ((sr + delta) % 360 + 360) % 360;
    if (newRotate === 360) newRotate = 0;
    out.set(id, { box: newBox, rotate: newRotate });
  }
  return out;
}

export function anchorOf(handle: HandleId, bbox: Box): Point {
  switch (handle) {
    case 'nw': return { x: bbox.x + bbox.w, y: bbox.y + bbox.h };
    case 'n':  return { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h };
    case 'ne': return { x: bbox.x, y: bbox.y + bbox.h };
    case 'w':  return { x: bbox.x + bbox.w, y: bbox.y + bbox.h / 2 };
    case 'e':  return { x: bbox.x, y: bbox.y + bbox.h / 2 };
    case 'sw': return { x: bbox.x + bbox.w, y: bbox.y };
    case 's':  return { x: bbox.x + bbox.w / 2, y: bbox.y };
    case 'se': return { x: bbox.x, y: bbox.y };
    default:   return { x: bbox.x, y: bbox.y };
  }
}

export type GroupResizeResult = { bbox: Box; widgets: Map<string, Box> };

export function applyGroupResize(
  startBbox: Box,
  newBbox: Box,
  handle: HandleId,
  startBoxes: Map<string, Box>,
  aspectLock: boolean,
): GroupResizeResult | null {
  const anchor = anchorOf(handle, startBbox);
  let scaleX = newBbox.w / startBbox.w;
  let scaleY = newBbox.h / startBbox.h;
  if (handle === 'n' || handle === 's') scaleX = 1;
  if (handle === 'w' || handle === 'e') scaleY = 1;
  const isCorner = handle === 'nw' || handle === 'ne' || handle === 'sw' || handle === 'se';
  if (aspectLock && isCorner) {
    const s = Math.min(Math.abs(scaleX), Math.abs(scaleY));
    scaleX = scaleX < 0 ? -s : s;
    scaleY = scaleY < 0 ? -s : s;
  }
  const widgets = new Map<string, Box>();
  for (const [id, sb] of startBoxes) {
    const newW = sb.w * scaleX;
    const newH = sb.h * scaleY;
    if (Math.abs(newW) < MIN_BOX || Math.abs(newH) < MIN_BOX) return null;
    const newX = anchor.x + (sb.x - anchor.x) * scaleX;
    const newY = anchor.y + (sb.y - anchor.y) * scaleY;
    widgets.set(id, { x: newX, y: newY, w: newW, h: newH });
  }
  const finalW = Math.abs(startBbox.w * scaleX);
  const finalH = Math.abs(startBbox.h * scaleY);
  let bx: number, by: number;
  switch (handle) {
    case 'nw': bx = anchor.x - finalW; by = anchor.y - finalH; break;
    case 'n':  bx = anchor.x - finalW / 2; by = anchor.y - finalH; break;
    case 'ne': bx = anchor.x; by = anchor.y - finalH; break;
    case 'w':  bx = anchor.x - finalW; by = anchor.y - finalH / 2; break;
    case 'e':  bx = anchor.x; by = anchor.y - finalH / 2; break;
    case 'sw': bx = anchor.x - finalW; by = anchor.y; break;
    case 's':  bx = anchor.x - finalW / 2; by = anchor.y; break;
    case 'se': bx = anchor.x; by = anchor.y; break;
    default:   bx = anchor.x; by = anchor.y; break;
  }
  return { bbox: { x: bx, y: by, w: finalW, h: finalH }, widgets };
}
