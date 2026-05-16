import type { SvgViewJson } from '../types';

export const EMPTY_VIEW: SvgViewJson = { width: 800, height: 600, items: [] };

export const SINGLE_RECT_VIEW: SvgViewJson = {
  width: 800,
  height: 600,
  items: [
    { id: 'r1', type: 'svg-rect', x: 10, y: 10, w: 100, h: 60, props: { fill: '#0a0' } },
  ],
};

export const SINGLE_LABEL_VIEW: SvgViewJson = {
  width: 800,
  height: 600,
  items: [
    { id: 'l1', type: 'svg-label', x: 50, y: 100, w: 100, h: 20, bindings: { tag: 'F01.TEMP' } },
  ],
};

export const MULTI_ZINDEX_VIEW: SvgViewJson = {
  width: 800,
  height: 600,
  items: [
    { id: 'mid', type: 'svg-rect', x: 0, y: 0, w: 10, h: 10, zIndex: 2 },
    { id: 'low', type: 'svg-rect', x: 0, y: 0, w: 10, h: 10, zIndex: 1 },
    { id: 'top', type: 'svg-rect', x: 0, y: 0, w: 10, h: 10, zIndex: 3 },
  ],
};
