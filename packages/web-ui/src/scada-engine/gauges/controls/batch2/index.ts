// SP-FX-6.2: Barrel for batch-2 controls.
// Importing this file registers all 5 batch-2 widget metas into gaugeRegistry.
// SP-FX-7 RuntimeCanvas imports batch1 and batch2 barrels at startup.

import { gaugeRegistry } from '../../gauge-registry';
import { gaugeSemaphoreMeta } from './gauge-semaphore';
import { gaugeProgressMeta } from './gauge-progress';
import { htmlSwitchMeta } from './html-switch';
import { sliderMeta } from './slider';
import { pipeMeta } from './pipe';

gaugeRegistry.register(gaugeSemaphoreMeta);
gaugeRegistry.register(gaugeProgressMeta);
gaugeRegistry.register(htmlSwitchMeta);
gaugeRegistry.register(sliderMeta);
gaugeRegistry.register(pipeMeta);

export { gaugeSemaphoreMeta, gaugeProgressMeta, htmlSwitchMeta, sliderMeta, pipeMeta };
