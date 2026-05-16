// packages/web-ui/src/widgets/svg/index.ts
import { registerSvg, _isBuiltinRegistered, _setBuiltinRegistered } from './registry';
import { SvgLabel } from './SvgLabel';
import { SvgRect } from './SvgRect';
import { SvgLamp } from './SvgLamp';
import { SvgIndicator } from './SvgIndicator';
import { SvgPump } from './SvgPump';
import { SvgValve } from './SvgValve';
import { SvgTank } from './SvgTank';
import { SvgTrend } from './SvgTrend';
import { SvgButton } from './SvgButton';
import { SvgMotor } from './SvgMotor';
import { SvgGauge } from './SvgGauge';
import { SvgSlider } from './SvgSlider';
import { SvgSwitch } from './SvgSwitch';
import { SvgSelect } from './SvgSelect';
import { SvgInput } from './SvgInput';
import { SvgChart } from './SvgChart';
import { SvgImage } from './SvgImage';
import { SvgPipe } from './SvgPipe';
import { SvgReactor } from './SvgReactor';
import { SvgSparger } from './SvgSparger';
import { SvgProbe } from './SvgProbe';
import { SvgStirrer } from './SvgStirrer';
import { SvgHeater } from './SvgHeater';
import { SvgSensor } from './SvgSensor';

export function ensureBuiltinSvgWidgetsRegistered(): void {
  if (_isBuiltinRegistered()) return;
  // Sub-project 1 plumbing
  registerSvg({ type: 'svg-label', label: 'Label', component: SvgLabel, defaults: { w: 100, h: 20 } });
  registerSvg({ type: 'svg-rect', label: 'Rect', component: SvgRect, defaults: { w: 100, h: 60 } });
  // Group A — ports
  registerSvg({ type: 'svg-lamp', label: 'Lamp', component: SvgLamp, defaults: { w: 40, h: 40 } });
  registerSvg({ type: 'svg-indicator', label: 'Indicator', component: SvgIndicator, defaults: { w: 80, h: 24 } });
  registerSvg({ type: 'svg-pump', label: 'Pump', component: SvgPump, defaults: { w: 40, h: 40 } });
  registerSvg({ type: 'svg-valve', label: 'Valve', component: SvgValve, defaults: { w: 40, h: 24 } });
  registerSvg({ type: 'svg-tank', label: 'Tank', component: SvgTank, defaults: { w: 60, h: 100 } });
  registerSvg({ type: 'svg-trend', label: 'Trend', component: SvgTrend, defaults: { w: 200, h: 80 } });
  registerSvg({ type: 'svg-button', label: 'Button', component: SvgButton, defaults: { w: 100, h: 30 } });
  // Group B — generic
  registerSvg({ type: 'svg-motor', label: 'Motor', component: SvgMotor, defaults: { w: 40, h: 40 } });
  registerSvg({ type: 'svg-gauge', label: 'Gauge', component: SvgGauge, defaults: { w: 80, h: 80 } });
  registerSvg({ type: 'svg-slider', label: 'Slider', component: SvgSlider, defaults: { w: 200, h: 24 } });
  registerSvg({ type: 'svg-switch', label: 'Switch', component: SvgSwitch, defaults: { w: 50, h: 24 } });
  registerSvg({ type: 'svg-select', label: 'Select', component: SvgSelect, defaults: { w: 120, h: 30 } });
  registerSvg({ type: 'svg-input', label: 'Input', component: SvgInput, defaults: { w: 120, h: 28 } });
  registerSvg({ type: 'svg-chart', label: 'Chart', component: SvgChart, defaults: { w: 200, h: 100 } });
  registerSvg({ type: 'svg-image', label: 'Image', component: SvgImage, defaults: { w: 100, h: 100 } });
  registerSvg({ type: 'svg-pipe', label: 'Pipe', component: SvgPipe, defaults: { w: 100, h: 20 } });
  // Group C — fermentation
  registerSvg({ type: 'svg-reactor', label: 'Reactor', component: SvgReactor, defaults: { w: 100, h: 140 } });
  registerSvg({ type: 'svg-sparger', label: 'Sparger', component: SvgSparger, defaults: { w: 100, h: 20 } });
  registerSvg({ type: 'svg-probe', label: 'Probe', component: SvgProbe, defaults: { w: 60, h: 60 } });
  registerSvg({ type: 'svg-stirrer', label: 'Stirrer', component: SvgStirrer, defaults: { w: 60, h: 60 } });
  registerSvg({ type: 'svg-heater', label: 'Heater', component: SvgHeater, defaults: { w: 80, h: 40 } });
  registerSvg({ type: 'svg-sensor', label: 'Sensor', component: SvgSensor, defaults: { w: 60, h: 60 } });
  _setBuiltinRegistered(true);
}

export * from './types';
export { registerSvg, getSvgWidget, listSvgWidgets } from './registry';
export { SvgLabel } from './SvgLabel';
export { SvgRect } from './SvgRect';
export { SvgLamp } from './SvgLamp';
export { SvgIndicator } from './SvgIndicator';
export { SvgPump } from './SvgPump';
export { SvgValve } from './SvgValve';
export { SvgTank } from './SvgTank';
export { SvgTrend } from './SvgTrend';
export { SvgButton } from './SvgButton';
export { SvgMotor } from './SvgMotor';
export { SvgGauge } from './SvgGauge';
export { SvgSlider } from './SvgSlider';
export { SvgSwitch } from './SvgSwitch';
export { SvgSelect } from './SvgSelect';
export { SvgInput } from './SvgInput';
export { SvgChart } from './SvgChart';
export { SvgImage } from './SvgImage';
export { SvgPipe } from './SvgPipe';
export { SvgReactor } from './SvgReactor';
export { SvgSparger } from './SvgSparger';
export { SvgProbe } from './SvgProbe';
export { SvgStirrer } from './SvgStirrer';
export { SvgHeater } from './SvgHeater';
export { SvgSensor } from './SvgSensor';
