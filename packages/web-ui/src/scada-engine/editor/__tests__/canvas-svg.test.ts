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
  // SP-FX-48.4: use type 'rect' which falls through to plain rect render;
  // svg-ext-* types now mount via GaugeRegistry and produce <g> wrappers
  // rather than direct rect attrs, breaking these unit-level assertions.
  return { id, type: 'rect', property: {}, x, y, w, h } as FuxaWidget;
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

describe('CanvasController.applyRotate (SP-FX-3b.2.2)', () => {
  it('applyRotate(id, 45, pivot) sets transform attr on widget node', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    c.loadView(makeView({ w1: makeWidget('w1', 50, 50, 120, 80) }));
    c.applyRotate('w1', 45, { x: 110, y: 90 });
    const el = container.querySelector('[data-widget-id="w1"]') as SVGElement;
    expect(el.getAttribute('transform')).toBe('rotate(45 110 90)');
    c.destroy();
  });

  it('applyRotate(id, 0, pivot) removes transform attr', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    c.loadView(makeView({ w1: makeWidget('w1', 50, 50, 120, 80) }));
    c.applyRotate('w1', 45, { x: 110, y: 90 });
    c.applyRotate('w1', 0, { x: 110, y: 90 });
    const el = container.querySelector('[data-widget-id="w1"]') as SVGElement;
    expect(el.getAttribute('transform')).toBeNull();
    c.destroy();
  });

  it('upsertWidget renders transform when widget.rotate is non-zero', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    const w = { ...makeWidget('w1', 50, 50, 100, 60), rotate: 30 } as any;
    c.loadView(makeView({ w1: w }));
    const el = container.querySelector('[data-widget-id="w1"]') as SVGElement;
    // cx = 50 + 100/2 = 100; cy = 50 + 60/2 = 80
    expect(el.getAttribute('transform')).toBe('rotate(30 100 80)');
    c.destroy();
  });
});

describe('CanvasController.setGridVisible (SP-FX-3b.1)', () => {
  it('setGridVisible(true) inserts pattern + grid rect; rect renders below widget layer', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    c.setGridVisible(true, 10);
    const pattern = container.querySelector('pattern[data-grid="10"]');
    const gridRect = container.querySelector('[data-overlay="grid"]');
    expect(pattern).not.toBeNull();
    expect(gridRect).not.toBeNull();
    expect(gridRect?.getAttribute('pointer-events')).toBe('none');
    // grid rect appears before widget layer in document order (= renders below)
    const root = c.getSvgRoot();
    const all = Array.from(root.children);
    const widgetLayer = root.querySelector('[data-layer="widgets"]');
    expect(all.indexOf(gridRect as Element)).toBeLessThan(all.indexOf(widgetLayer as Element));
  });

  it('setGridVisible(false) removes pattern + rect; idempotent on second false', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    c.setGridVisible(true, 10);
    c.setGridVisible(false);
    expect(container.querySelector('pattern[data-grid]')).toBeNull();
    expect(container.querySelector('[data-overlay="grid"]')).toBeNull();
    expect(() => c.setGridVisible(false)).not.toThrow();
  });

  it('re-true after false re-inserts; widget layer untouched', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    c.upsertWidget({ id: 'w1', type: 'svg-ext-value', property: {}, x: 50, y: 50, w: 100, h: 80 } as any);
    c.setGridVisible(true, 10);
    c.setGridVisible(false);
    c.setGridVisible(true, 10);
    expect(container.querySelector('pattern[data-grid="10"]')).not.toBeNull();
    expect(container.querySelector('[data-widget-id="w1"]')).not.toBeNull();
  });
});

describe('CanvasController.upsertWidget rotate regression (SP-FX-3b.2.3)', () => {
  it('upsertWidget existing widget rotate 30→60 updates transform attr', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = { ...makeWidget('w1', 50, 50, 100, 60), rotate: 30 } as any;
    c.loadView(makeView({ w1: w }));
    const el = container.querySelector('[data-widget-id="w1"]') as SVGElement;
    expect(el.getAttribute('transform')).toBe('rotate(30 100 80)');
    c.upsertWidget({ ...w, rotate: 60 });
    expect(el.getAttribute('transform')).toBe('rotate(60 100 80)');
    c.destroy();
  });

  it('upsertWidget existing widget rotate set to undefined removes transform attr', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = { ...makeWidget('w1', 50, 50, 100, 60), rotate: 30 } as any;
    c.loadView(makeView({ w1: w }));
    const el = container.querySelector('[data-widget-id="w1"]') as SVGElement;
    expect(el.getAttribute('transform')).toBe('rotate(30 100 80)');
    c.upsertWidget(makeWidget('w1', 50, 50, 100, 60));
    expect(el.getAttribute('transform')).toBeNull();
    c.destroy();
  });
});

describe('canvas-svg shape widget', () => {
  it('creates <image> with href/x/y/width/height/preserveAspectRatio', () => {
    const host = document.createElement('div');
    const c = new CanvasController(host, { width: 800, height: 600 });
    c.upsertWidget({
      id: 'w1',
      type: 'shape',
      property: { src: '/scada-shapes/tank1.svg', shapeId: 'tank1' },
      x: 100, y: 50, w: 80, h: 80,
    } as any);
    const img = host.querySelector('image[data-widget-id="w1"]') as SVGImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute('href') || img.getAttribute('xlink:href')).toBe('/scada-shapes/tank1.svg');
    expect(img.getAttribute('x')).toBe('100');
    expect(img.getAttribute('y')).toBe('50');
    expect(img.getAttribute('width')).toBe('80');
    expect(img.getAttribute('height')).toBe('80');
    expect(img.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
  });

  it('resize updates width and height attrs in place', () => {
    const host = document.createElement('div');
    const c = new CanvasController(host, { width: 800, height: 600 });
    c.upsertWidget({
      id: 'w1', type: 'shape',
      property: { src: '/scada-shapes/tank1.svg', shapeId: 'tank1' },
      x: 0, y: 0, w: 80, h: 80,
    } as any);
    c.upsertWidget({
      id: 'w1', type: 'shape',
      property: { src: '/scada-shapes/tank1.svg', shapeId: 'tank1' },
      x: 0, y: 0, w: 160, h: 120,
    } as any);
    const img = host.querySelector('image[data-widget-id="w1"]') as SVGImageElement;
    expect(img.getAttribute('width')).toBe('160');
    expect(img.getAttribute('height')).toBe('120');
    expect(host.querySelectorAll('image[data-widget-id="w1"]').length).toBe(1);
  });

  it('src change updates href attr in place', () => {
    const host = document.createElement('div');
    const c = new CanvasController(host, { width: 800, height: 600 });
    c.upsertWidget({
      id: 'w1', type: 'shape',
      property: { src: '/scada-shapes/tank1.svg', shapeId: 'tank1' },
      x: 0, y: 0, w: 80, h: 80,
    } as any);
    c.upsertWidget({
      id: 'w1', type: 'shape',
      property: { src: '/scada-shapes/valve.svg', shapeId: 'valve' },
      x: 0, y: 0, w: 80, h: 80,
    } as any);
    const img = host.querySelector('image[data-widget-id="w1"]') as SVGImageElement;
    expect(img.getAttribute('href') || img.getAttribute('xlink:href')).toBe('/scada-shapes/valve.svg');
  });
});

describe('CanvasController.upsertWidget type rendering (SP-FX-4)', () => {
  it('type="rect" renders <rect> element with x/y/w/h attrs', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.upsertWidget({ id: 'r1', type: 'rect', property: {}, x: 10, y: 20, w: 100, h: 60 } as any);
    const el = container.querySelector('[data-widget-id="r1"]') as SVGElement;
    expect(el).not.toBeNull();
    expect(el.tagName.toLowerCase()).toBe('rect');
    expect(el.getAttribute('x')).toBe('10');
    expect(el.getAttribute('y')).toBe('20');
    expect(el.getAttribute('width')).toBe('100');
    expect(el.getAttribute('height')).toBe('60');
    c.destroy();
  });

  it('type="ellipse" renders <ellipse> element with cx/cy/rx/ry attrs', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.upsertWidget({ id: 'e1', type: 'ellipse', property: {}, x: 10, y: 20, w: 80, h: 40 } as any);
    const el = container.querySelector('[data-widget-id="e1"]') as SVGElement;
    expect(el).not.toBeNull();
    expect(el.tagName.toLowerCase()).toBe('ellipse');
    expect(el.getAttribute('cx')).toBe('50');
    expect(el.getAttribute('cy')).toBe('40');
    expect(el.getAttribute('rx')).toBe('40');
    expect(el.getAttribute('ry')).toBe('20');
    c.destroy();
  });

  it('type="text" renders <text> element with content from property.text or fallback', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.upsertWidget({ id: 't1', type: 'text', property: { text: 'Hello' }, x: 10, y: 20, w: 120, h: 30 } as any);
    const el = container.querySelector('[data-widget-id="t1"]') as SVGElement;
    expect(el).not.toBeNull();
    expect(el.tagName.toLowerCase()).toBe('text');
    expect(el.textContent).toBe('Hello');

    // fallback when property.text missing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.upsertWidget({ id: 't2', type: 'text', property: {}, x: 10, y: 20, w: 120, h: 30 } as any);
    const el2 = container.querySelector('[data-widget-id="t2"]') as SVGElement;
    expect(el2.textContent).toBe('文本');
    c.destroy();
  });
});
