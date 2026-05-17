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
