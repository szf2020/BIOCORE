// Test helper: minimal CanvasController stand-in for pointer-tools unit tests.
// pointer-tools is framework-agnostic and only calls canvas.upsertWidget /
// canvas.getSvgRoot; we stub them out so pointer-tools tests don't drag in
// svg.js + jsdom.
//
// Usage:
//   const canvas = makeMockCanvas();
//   const tools = new PointerTools(canvas, mockHandles, callbacks);
//   tools.handleMouseDown(...)

import { vi } from 'vitest';

export interface MockCanvas {
  upsertWidget: ReturnType<typeof vi.fn>;
  applyRotate: ReturnType<typeof vi.fn>;
  getSvgRoot: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  _svgRoot: SVGSVGElement;
}

export function makeMockCanvas(): MockCanvas {
  const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
  document.body.appendChild(svgRoot);
  return {
    upsertWidget: vi.fn(),
    applyRotate: vi.fn(),
    getSvgRoot: vi.fn(() => svgRoot) as ReturnType<typeof vi.fn>,
    destroy: vi.fn(),
    _svgRoot: svgRoot,
  };
}

export interface MockHandles {
  show: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
  updateBox: ReturnType<typeof vi.fn>;
  hitTest: ReturnType<typeof vi.fn>;
}

export function makeMockHandles(): MockHandles {
  return {
    show: vi.fn(),
    hide: vi.fn(),
    updateBox: vi.fn(),
    hitTest: vi.fn(() => null) as ReturnType<typeof vi.fn>,
  };
}
