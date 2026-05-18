// SP-FX-48.7: Barrel for batch-5 controls (FUXA parity — panel/video/scheduler).
// Side-effect import registers all 3 widget metas into gaugeRegistry.

import { gaugeRegistry } from '../../gauge-registry';
import { panelMeta } from './panel';
import { htmlVideoMeta } from './html-video';
import { htmlSchedulerMeta } from './html-scheduler';

gaugeRegistry.register(panelMeta);
gaugeRegistry.register(htmlVideoMeta);
gaugeRegistry.register(htmlSchedulerMeta);

export { panelMeta, htmlVideoMeta, htmlSchedulerMeta };
