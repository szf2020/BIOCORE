import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CanvasController } from '../canvas-svg';
import { TransformHandles, SnapGuides, RotateTooltip } from '../transform-handles';
import type { Box } from '../geometry';

let container: HTMLDivElement;
let canvas: CanvasController;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  canvas = new CanvasController(container, { width: 800, height: 600 });
});

afterEach(() => {
  canvas.destroy();
  container.remove();
});

describe('TransformHandles (SP-FX-3a)', () => {
  it('starts hidden', () => {
    new TransformHandles(canvas.overlayLayer);
    const overlay = container.querySelector('[data-overlay="transform"]') as SVGGElement;
    expect(overlay).not.toBeNull();
    expect(overlay.getAttribute('visibility')).toBe('hidden');
  });

  it('show renders 9 handles + selection rect', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    h.show({ x: 100, y: 100, w: 80, h: 60 });
    const handles = container.querySelectorAll('[data-handle]');
    expect(handles.length).toBe(9);
    expect(container.querySelector('[data-overlay-part="selection-rect"]')).not.toBeNull();
    const overlay = container.querySelector('[data-overlay="transform"]') as SVGGElement;
    expect(overlay.getAttribute('visibility')).not.toBe('hidden');
  });

  it('hide collapses the overlay', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    h.show({ x: 0, y: 0, w: 50, h: 50 });
    h.hide();
    const overlay = container.querySelector('[data-overlay="transform"]') as SVGGElement;
    expect(overlay.getAttribute('visibility')).toBe('hidden');
  });

  it('hide also clears every individual handle visibility (regression: stale outline after delete)', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    h.show({ x: 0, y: 0, w: 50, h: 50 });
    h.hide();
    // SVG visibility="visible" on a handle would override the parent group's
    // "hidden" and leave the resize outline floating after the widget is gone.
    const handles = Array.from(container.querySelectorAll('[data-handle]')) as SVGElement[];
    expect(handles.length).toBeGreaterThan(0);
    for (const handleEl of handles) {
      expect(handleEl.getAttribute('visibility')).toBe('hidden');
    }
  });

  it('updateBox moves existing handles to new positions', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    h.show({ x: 0, y: 0, w: 50, h: 50 });
    const firstSe = container.querySelector('[data-handle="se"]') as SVGRectElement;
    expect(firstSe.getAttribute('x')).toBe(String(50 - 4));
    h.updateBox({ x: 0, y: 0, w: 200, h: 100 });
    const sameSe = container.querySelector('[data-handle="se"]') as SVGRectElement;
    expect(sameSe).toBe(firstSe);
    expect(sameSe.getAttribute('x')).toBe(String(200 - 4));
  });

  it('hitTest returns SE handle at SE position', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    const box: Box = { x: 100, y: 100, w: 80, h: 60 };
    h.show(box);
    expect(h.hitTest({ x: 180, y: 160 })).toBe('se');
  });

  it('hitTest returns NW handle at NW position', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    h.show({ x: 100, y: 100, w: 80, h: 60 });
    expect(h.hitTest({ x: 100, y: 100 })).toBe('nw');
  });

  it('hitTest returns rotate handle at rotate position', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    h.show({ x: 100, y: 100, w: 80, h: 60 });
    expect(h.hitTest({ x: 140, y: 80 })).toBe('rotate');
  });

  it('hitTest returns null when hidden', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    h.show({ x: 100, y: 100, w: 80, h: 60 });
    h.hide();
    expect(h.hitTest({ x: 180, y: 160 })).toBeNull();
  });
});

describe('TransformHandles.showBbox (SP-FX-3b.2.1)', () => {
  it('showBbox renders dashed bbox + 4 corner indicators + visible resize handles + rotate (SP-FX-3b.2.3)', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    h.showBbox({ x: 100, y: 100, w: 200, h: 80 });
    const overlay = container.querySelector('[data-overlay="transform"]') as SVGGElement;
    expect(overlay.getAttribute('visibility')).not.toBe('hidden');
    const corners = container.querySelectorAll('[data-bbox-corner]');
    expect(corners.length).toBe(4);
    const resizeHandles = container.querySelectorAll('[data-handle]');
    expect(resizeHandles.length).toBe(9);
    resizeHandles.forEach((rh) => {
      expect(rh.getAttribute('visibility')).not.toBe('hidden');
    });
  });

  it('show(single) after showBbox restores resize handles', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    h.showBbox({ x: 0, y: 0, w: 200, h: 80 });
    h.show({ x: 50, y: 50, w: 100, h: 60 });
    const resizeHandles = container.querySelectorAll('[data-handle]');
    expect(resizeHandles.length).toBe(9);
    const corners = container.querySelectorAll('[data-bbox-corner]');
    corners.forEach((c) => {
      expect(c.getAttribute('visibility')).toBe('hidden');
    });
  });
});

describe('SnapGuides (SP-FX-3b.2.1)', () => {
  it('show renders H and V lines at box.y / box.x with viewBox extent', () => {
    const guides = new SnapGuides(canvas.overlayLayer);
    guides.show({ x: 60, y: 70, w: 50, h: 30 }, { w: 800, h: 600 });
    const h = container.querySelector('[data-guide="h"]') as SVGLineElement;
    const v = container.querySelector('[data-guide="v"]') as SVGLineElement;
    expect(h).not.toBeNull();
    expect(v).not.toBeNull();
    expect(h.getAttribute('y1')).toBe('70');
    expect(h.getAttribute('y2')).toBe('70');
    expect(h.getAttribute('x1')).toBe('0');
    expect(h.getAttribute('x2')).toBe('800');
    expect(v.getAttribute('x1')).toBe('60');
    expect(v.getAttribute('x2')).toBe('60');
    expect(v.getAttribute('y1')).toBe('0');
    expect(v.getAttribute('y2')).toBe('600');
    const group = container.querySelector('[data-overlay="snap-guides"]');
    expect(group?.getAttribute('visibility')).toBe('visible');
  });

  it('hide() sets visibility hidden; idempotent', () => {
    const guides = new SnapGuides(canvas.overlayLayer);
    guides.show({ x: 0, y: 0, w: 50, h: 50 }, { w: 800, h: 600 });
    guides.hide();
    const group = container.querySelector('[data-overlay="snap-guides"]');
    expect(group?.getAttribute('visibility')).toBe('hidden');
    expect(() => guides.hide()).not.toThrow();
  });
});

describe('RotateTooltip (SP-FX-3b.2.2)', () => {
  it('show renders SVG text with degree label at pivot offset', () => {
    const t = new RotateTooltip(canvas.overlayLayer);
    t.show(45.3, { x: 100, y: 50 });
    const group = container.querySelector('[data-overlay="rotate-tooltip"]') as SVGGElement;
    expect(group).not.toBeNull();
    expect(group.getAttribute('visibility')).toBe('visible');
    const text = container.querySelector('[data-rotate-text]') as SVGTextElement;
    expect(text).not.toBeNull();
    expect(text.textContent).toBe('45.3°');
    expect(text.getAttribute('x')).toBe('112');
    expect(text.getAttribute('y')).toBe('46');
  });

  it('hide sets visibility hidden; idempotent', () => {
    const t = new RotateTooltip(canvas.overlayLayer);
    t.show(45, { x: 100, y: 50 });
    t.hide();
    const group = container.querySelector('[data-overlay="rotate-tooltip"]') as SVGGElement;
    expect(group.getAttribute('visibility')).toBe('hidden');
    expect(() => t.hide()).not.toThrow();
  });

  it('destroy removes node from DOM; idempotent', () => {
    const t = new RotateTooltip(canvas.overlayLayer);
    t.show(45, { x: 100, y: 50 });
    t.destroy();
    expect(container.querySelector('[data-overlay="rotate-tooltip"]')).toBeNull();
    expect(() => t.destroy()).not.toThrow();
  });
});

describe('TransformHandles.showBbox SP-FX-3b.2.3 group-resize handles', () => {
  it('showBbox positions resize handles at bbox edges', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    h.showBbox({ x: 100, y: 100, w: 200, h: 80 });
    const se = container.querySelector('[data-handle="se"]') as SVGRectElement;
    expect(se).not.toBeNull();
    const seX = Number(se.getAttribute('x'));
    const seY = Number(se.getAttribute('y'));
    expect(Math.abs(seX + 4 - 300)).toBeLessThanOrEqual(5);
    expect(Math.abs(seY + 4 - 180)).toBeLessThanOrEqual(5);
  });

  it('showBbox positions rotate handle above bbox top center', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    h.showBbox({ x: 100, y: 100, w: 200, h: 80 });
    const rotate = container.querySelector('[data-handle="rotate"]') as SVGRectElement;
    expect(rotate).not.toBeNull();
    const rX = Number(rotate.getAttribute('x'));
    const rY = Number(rotate.getAttribute('y'));
    expect(Math.abs(rX + 4 - 200)).toBeLessThanOrEqual(5);
    expect(rY).toBeLessThan(100);
  });

  it('showBbox→show(single) transition: corners hidden, handles re-layout to single widget', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    h.showBbox({ x: 0, y: 0, w: 200, h: 80 });
    h.show({ x: 50, y: 50, w: 100, h: 60 });
    const corners = container.querySelectorAll('[data-bbox-corner]');
    corners.forEach((c) => {
      expect(c.getAttribute('visibility')).toBe('hidden');
    });
    const se = container.querySelector('[data-handle="se"]') as SVGRectElement;
    const seX = Number(se.getAttribute('x'));
    const seY = Number(se.getAttribute('y'));
    expect(Math.abs(seX + 4 - 150)).toBeLessThanOrEqual(5);
    expect(Math.abs(seY + 4 - 110)).toBeLessThanOrEqual(5);
  });

  it('showBbox hitTest finds rotate handle above bbox top center', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    h.showBbox({ x: 100, y: 100, w: 200, h: 80 });
    const hit = h.hitTest({ x: 200, y: 80 });
    expect(hit).toBe('rotate');
  });
});
