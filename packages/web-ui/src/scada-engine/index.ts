// Public surface of scada-engine. SP-FX-1 exposes only models + api;
// later SP-FX batches expand this barrel as their modules land.
export * from './models/hmi';
export * from './models/view';
export * from './models/widget';
export * from './models/property';
export * from './models/animation';
export * as fuxaViewsApi from './api/fuxa-views';

// SP-FX-2 additions
export * from './services';
export * from './dialogs';

// SP-FX-3a additions
export * from './editor';

// SP-FX-6 additions
export { gaugeRegistry, GaugeRegistry } from './gauges/gauge-registry';
export type { GaugeBase, GaugeValue, GaugeContext, GaugeMeta, GaugePropChange, GaugeClickContext } from './gauges/gauge-base';

// SP-FX-7 additions
export * from './runtime';
