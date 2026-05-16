import { registerSvg } from './registry';
import { SvgLabel } from './SvgLabel';
import { SvgRect } from './SvgRect';

let registered = false;
export function ensureBuiltinSvgWidgetsRegistered(): void {
  if (registered) return;
  registerSvg({ type: 'svg-label', label: 'Label', component: SvgLabel, defaults: { w: 100, h: 20 } });
  registerSvg({ type: 'svg-rect', label: 'Rect', component: SvgRect, defaults: { w: 100, h: 60 } });
  registered = true;
}

export * from './types';
export { registerSvg, getSvgWidget, listSvgWidgets } from './registry';
export { SvgLabel } from './SvgLabel';
export { SvgRect } from './SvgRect';
