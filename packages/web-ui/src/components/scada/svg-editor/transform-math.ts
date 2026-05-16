// packages/web-ui/src/components/scada/svg-editor/transform-math.ts
import type { AABB, ResizeHandleId, ResizeModifiers, RotateModifiers } from './types';

const MIN_DIM = 1;

/**
 * Resize an AABB by dragging a handle by (dx, dy). Anchor is the opposite handle.
 *
 * Modifiers:
 *   - aspect: lock w/h ratio (dominant axis drives the other)
 *   - centered: keep center fixed (both opposing sides move)
 *
 * Output bbox is normalized: drag-through is handled by flipping w/h to positive
 * and shifting x/y accordingly. Minimum dimensions enforced.
 */
export function resizeRect(
  bbox: AABB,
  handle: ResizeHandleId,
  dx: number,
  dy: number,
  modifiers: ResizeModifiers,
): AABB {
  let x = bbox.x;
  let y = bbox.y;
  let w = bbox.w;
  let h = bbox.h;

  const moveLeft = handle === 'nw' || handle === 'w' || handle === 'sw';
  const moveRight = handle === 'ne' || handle === 'e' || handle === 'se';
  const moveTop = handle === 'nw' || handle === 'n' || handle === 'ne';
  const moveBottom = handle === 'sw' || handle === 's' || handle === 'se';

  if (moveLeft) {
    x = bbox.x + dx;
    w = bbox.w - dx;
  } else if (moveRight) {
    w = bbox.w + dx;
  }
  if (moveTop) {
    y = bbox.y + dy;
    h = bbox.h - dy;
  } else if (moveBottom) {
    h = bbox.h + dy;
  }

  if (modifiers.centered) {
    if (moveLeft) {
      x = bbox.x + dx;
      w = bbox.w - 2 * dx;
    } else if (moveRight) {
      x = bbox.x - dx;
      w = bbox.w + 2 * dx;
    }
    if (moveTop) {
      y = bbox.y + dy;
      h = bbox.h - 2 * dy;
    } else if (moveBottom) {
      y = bbox.y - dy;
      h = bbox.h + 2 * dy;
    }
  }

  if (modifiers.aspect && bbox.w !== 0 && bbox.h !== 0) {
    const origRatio = bbox.w / bbox.h;
    const dwAbs = Math.abs(w - bbox.w);
    const dhAbs = Math.abs(h - bbox.h);
    if (dwAbs >= dhAbs) {
      const newH = w / origRatio;
      const deltaH = newH - h;
      if (moveTop) {
        y -= deltaH;
      } else if (!moveBottom && !moveTop) {
        y -= deltaH / 2;
      }
      h = newH;
    } else {
      const newW = h * origRatio;
      const deltaW = newW - w;
      if (moveLeft) {
        x -= deltaW;
      } else if (!moveLeft && !moveRight) {
        x -= deltaW / 2;
      }
      w = newW;
    }
  }

  if (w < 0) {
    x = x + w;
    w = -w;
  }
  if (h < 0) {
    y = y + h;
    h = -h;
  }

  if (w < MIN_DIM) w = MIN_DIM;
  if (h < MIN_DIM) h = MIN_DIM;

  return { x, y, w, h };
}

export function rotateAroundCenter(
  bbox: AABB,
  currentRotation: number,
  pointerStart: { x: number; y: number },
  pointerCurrent: { x: number; y: number },
  modifiers: RotateModifiers,
): number {
  const cx = bbox.x + bbox.w / 2;
  const cy = bbox.y + bbox.h / 2;
  const startAngle = Math.atan2(pointerStart.y - cy, pointerStart.x - cx);
  const curAngle = Math.atan2(pointerCurrent.y - cy, pointerCurrent.x - cx);
  const deltaDeg = ((curAngle - startAngle) * 180) / Math.PI;
  let result = currentRotation + deltaDeg;
  result = ((result % 360) + 360) % 360;
  if (modifiers.snap15) {
    result = Math.round(result / 15) * 15;
    if (result === 360) result = 0;
  }
  return result;
}

export function snapToGrid(value: number, gridSize: number): number {
  if (gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

export function intersects(a: AABB, b: AABB): boolean {
  return !(
    b.x + b.w < a.x ||
    a.x + a.w < b.x ||
    b.y + b.h < a.y ||
    a.y + a.h < b.y
  );
}

/**
 * Convert client coords to SVG user-space using inverse CTM. Falls back to
 * raw client coords when getScreenCTM() is unavailable (e.g. in jsdom).
 */
export function svgPoint(
  svgEl: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const ctm = svgEl.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  const pt = svgEl.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const transformed = pt.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
}
