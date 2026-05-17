import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CanvasController } from '../canvas-svg';
import { TransformHandles } from '../transform-handles';
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
