// jsdom helpers for SVG tests. jsdom does not implement:
// - SVGSVGElement.getCTM / getScreenCTM
// - SVGGraphicsElement.getBBox
// - getBoundingClientRect returning realistic values
// These helpers patch missing methods on specific elements so tests can
// exercise code paths that depend on them.

export function mockGetCTM(svg: SVGSVGElement, ctm?: DOMMatrix): void {
  const matrix = ctm ?? (typeof DOMMatrix !== 'undefined' ? new DOMMatrix() : ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } as DOMMatrix));
  (svg as any).getCTM = () => matrix;
  (svg as any).getScreenCTM = () => matrix;
}

export function mockBBox(el: SVGGraphicsElement, bbox: { x: number; y: number; width: number; height: number }): void {
  (el as any).getBBox = () => bbox;
}

export function mockClientRect(el: HTMLElement | SVGElement, rect: { left?: number; top?: number; width?: number; height?: number }): void {
  const full = {
    left: rect.left ?? 0,
    top: rect.top ?? 0,
    width: rect.width ?? 800,
    height: rect.height ?? 600,
    right: (rect.left ?? 0) + (rect.width ?? 800),
    bottom: (rect.top ?? 0) + (rect.height ?? 600),
    x: rect.left ?? 0,
    y: rect.top ?? 0,
    toJSON: () => full,
  };
  (el as any).getBoundingClientRect = () => full;
}

export function identityMatrix(): DOMMatrix {
  return typeof DOMMatrix !== 'undefined'
    ? new DOMMatrix()
    : ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } as DOMMatrix);
}
