// SP-FX-2: pure-function selection helpers for the editor canvas (SP-FX-3+)
// and for editor-store. Stateless, easy to test in isolation.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WidgetGeom {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * AABB (Axis-Aligned Bounding Box) inclusive intersection test.
 * Returns true if widget overlaps or touches the box (inclusive on edges).
 */
export function boxIntersects(box: Rect, widget: WidgetGeom): boolean {
  return !(
    widget.x + widget.w < box.x ||
    widget.x > box.x + box.w ||
    widget.y + widget.h < box.y ||
    widget.y > box.y + box.h
  );
}

/**
 * Compute added/removed IDs between previous and next selection sets.
 * Used for incremental highlight updates in the editor.
 */
export function diffSelection(
  prev: string[],
  next: string[]
): { added: string[]; removed: string[] } {
  const prevSet = new Set(prev);
  const nextSet = new Set(next);
  return {
    added: next.filter((id) => !prevSet.has(id)),
    removed: prev.filter((id) => !nextSet.has(id)),
  };
}
