import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CanvasController } from '../canvas-svg';
import type { FuxaView, FuxaWidget } from '../../models';

function makeView(items: Record<string, FuxaWidget> = {}): FuxaView {
  return {
    id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>',
    width: 800, height: 600, items, schemaVersion: 1,
  } as FuxaView;
}

function makeWidget(id: string, x = 10, y = 10, w = 50, h = 30): FuxaWidget {
  return { id, type: 'svg-ext-value', property: {}, x, y, w, h } as FuxaWidget;
}

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
});

describe('CanvasController (SP-FX-3a)', () => {
  it('ctor creates svg root with widget + overlay layers', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    const svg = c.getSvgRoot();
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('width')).toBe('800');
    expect(container.querySelector('[data-layer="widgets"]')).not.toBeNull();
    expect(container.querySelector('[data-layer="overlay"]')).not.toBeNull();
  });

  it('ctor throws on invalid size', () => {
    expect(() => new CanvasController(container, { width: 0, height: 600 })).toThrow(/invalid canvas size/i);
    expect(() => new CanvasController(container, { width: 800, height: -1 })).toThrow(/invalid canvas size/i);
  });

  it('loadView renders one widget per item', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    c.loadView(makeView({ w1: makeWidget('w1'), w2: makeWidget('w2', 100, 100) }));
    expect(c.getElement('w1')).toBeDefined();
    expect(c.getElement('w2')).toBeDefined();
  });

  it('upsertWidget creates element on first call', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    c.upsertWidget(makeWidget('w1', 50, 30, 100, 80));
    const el = c.getElement('w1');
    expect(el).toBeDefined();
    expect(el!.node.getAttribute('x')).toBe('50');
    expect(el!.node.getAttribute('y')).toBe('30');
    expect(el!.node.getAttribute('width')).toBe('100');
    expect(el!.node.getAttribute('height')).toBe('80');
  });

  it('upsertWidget updates existing element on second call', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    c.upsertWidget(makeWidget('w1', 50, 30));
    c.upsertWidget(makeWidget('w1', 200, 150, 60, 40));
    const el = c.getElement('w1');
    expect(el!.node.getAttribute('x')).toBe('200');
    expect(el!.node.getAttribute('width')).toBe('60');
  });

  it('upsertWidget skips widgets without x/y/w/h (no crash)', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    c.upsertWidget({ id: 'no-geo', type: 'svg-ext-value', property: {} } as FuxaWidget);
    expect(c.getElement('no-geo')).toBeUndefined();
  });

  it('removeWidget deletes the element', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    c.upsertWidget(makeWidget('w1'));
    c.removeWidget('w1');
    expect(c.getElement('w1')).toBeUndefined();
  });

  it('removeWidget on missing id is a no-op', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    expect(() => c.removeWidget('ghost')).not.toThrow();
  });

  it('destroy clears all elements and is idempotent', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    c.upsertWidget(makeWidget('w1'));
    c.destroy();
    expect(container.querySelector('svg')).toBeNull();
    expect(() => c.destroy()).not.toThrow();
    expect(() => c.upsertWidget(makeWidget('w2'))).not.toThrow();
    expect(c.getElement('w2')).toBeUndefined();
  });

  it('loadView replaces existing widget map (idempotent on re-load)', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    c.loadView(makeView({ w1: makeWidget('w1') }));
    expect(c.getElement('w1')).toBeDefined();
    c.loadView(makeView({ w2: makeWidget('w2') }));
    expect(c.getElement('w1')).toBeUndefined();
    expect(c.getElement('w2')).toBeDefined();
  });
});
